-- Backfill the denormalized user loyalty level projection from current spending thresholds.
-- The authoritative inputs are users.totalSpent and loyalty_levels.minSpent.
WITH expected_user_levels AS (
  SELECT
    u.id AS user_id,
    resolved_level.id AS loyalty_level_id
  FROM users u
  LEFT JOIN LATERAL (
    SELECT l.id
    FROM loyalty_levels l
    WHERE l."minSpent" <= u."totalSpent"
    ORDER BY l."minSpent" DESC, l.id DESC
    LIMIT 1
  ) resolved_level ON true
)
UPDATE users u
SET "loyaltyLevelId" = expected_user_levels.loyalty_level_id
FROM expected_user_levels
WHERE expected_user_levels.user_id = u.id
  AND expected_user_levels.loyalty_level_id IS DISTINCT FROM u."loyaltyLevelId";
