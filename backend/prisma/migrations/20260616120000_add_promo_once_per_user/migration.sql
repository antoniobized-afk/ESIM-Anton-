-- Enforce "one user — one promo": a user can CONSUME a given promo code at
-- most once. Discount is granted on a single order per (promoCode, user),
-- both for manual entry and referral-link auto-promo.
--
-- Layers (DB-level guarantee added here complements the application guards in
-- PromoCodesService.validateForReservation / reserveForOrder):
--   * partial unique index on CONSUMED redemptions per (promoCodeId, userId).
--
-- Preflight (read-only) — list pre-existing duplicates that must be reconciled
-- before the unique index can be created:
--   SELECT "promoCodeId", "userId", COUNT(*) AS consumed_count
--   FROM promo_code_redemptions
--   WHERE status = 'CONSUMED'
--   GROUP BY "promoCodeId", "userId"
--   HAVING COUNT(*) > 1;
--
-- Rollback note for the raw partial unique index:
--   DROP INDEX IF EXISTS promo_code_redemptions_consumed_once_per_user;

-- 1) One-time reconciliation of legacy duplicate consumptions.
--    Keep the earliest CONSUMED redemption per (promoCodeId, userId); release
--    the surplus so the new invariant holds. Completed orders keep the discount
--    that was already applied and the eSIMs that were already delivered — only
--    the eligibility ledger is corrected. usedCount is realigned to the number
--    of legitimate single consumptions.
WITH ranked AS (
  SELECT
    id,
    "promoCodeId",
    row_number() OVER (
      PARTITION BY "promoCodeId", "userId"
      ORDER BY COALESCE("consumedAt", "createdAt") ASC, id ASC
    ) AS rn
  FROM promo_code_redemptions
  WHERE status = 'CONSUMED'
),
surplus AS (
  SELECT id, "promoCodeId" FROM ranked WHERE rn > 1
),
released AS (
  UPDATE promo_code_redemptions r
  SET status = 'RELEASED', "releasedAt" = now()
  FROM surplus s
  WHERE r.id = s.id
  RETURNING r."promoCodeId"
)
UPDATE promo_codes p
SET "usedCount" = GREATEST(p."usedCount" - agg.cnt, 0)
FROM (
  SELECT "promoCodeId", COUNT(*)::int AS cnt
  FROM released
  GROUP BY "promoCodeId"
) agg
WHERE p.id = agg."promoCodeId";

-- 2) DB-level guarantee: at most one CONSUMED redemption per (promoCodeId, userId).
CREATE UNIQUE INDEX promo_code_redemptions_consumed_once_per_user
ON promo_code_redemptions ("promoCodeId", "userId")
WHERE status = 'CONSUMED';
