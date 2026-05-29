-- Phase 17 Step 2: partner promo policy, immutable redemption snapshots and
-- explicit analytics key for partner promo reward transactions.
--
-- Backward compatibility:
-- - existing promo_codes stay ordinary promos because all partner fields are nullable;
-- - existing promo_code_redemptions keep NULL reward snapshots;
-- - existing transactions keep NULL promoCodeId.
--
-- Preflight before applying the order-level partial unique index:
-- SELECT "orderId", COUNT(*) AS duplicate_count
-- FROM transactions
-- WHERE type = 'REFERRAL_BONUS' AND "orderId" IS NOT NULL
-- GROUP BY "orderId"
-- HAVING COUNT(*) > 1;
--
-- Rollback note for the raw partial unique index:
-- DROP INDEX IF EXISTS transactions_referral_bonus_once_per_order;

ALTER TABLE "promo_codes"
ADD COLUMN "referralOwnerId" TEXT,
ADD COLUMN "referralBonusPercent" DECIMAL(5,2),
ADD COLUMN "referralPayoutMode" "ReferralPayoutMode";

ALTER TABLE "promo_code_redemptions"
ADD COLUMN "rewardOwnerIdSnapshot" TEXT,
ADD COLUMN "rewardBonusPercentSnapshot" DECIMAL(5,2),
ADD COLUMN "rewardPayoutModeSnapshot" "ReferralPayoutMode";

ALTER TABLE "transactions"
ADD COLUMN "promoCodeId" TEXT;

CREATE INDEX "promo_codes_referralOwnerId_idx"
ON "promo_codes"("referralOwnerId");

CREATE INDEX "promo_code_redemptions_rewardOwnerIdSnapshot_status_idx"
ON "promo_code_redemptions"("rewardOwnerIdSnapshot", "status");

CREATE INDEX "transactions_promoCodeId_idx"
ON "transactions"("promoCodeId");

CREATE INDEX "transactions_promoCodeId_type_status_idx"
ON "transactions"("promoCodeId", "type", "status");

CREATE UNIQUE INDEX transactions_referral_bonus_once_per_order
ON transactions ("orderId")
WHERE type = 'REFERRAL_BONUS' AND "orderId" IS NOT NULL;

ALTER TABLE "promo_codes"
ADD CONSTRAINT "promo_codes_referralOwnerId_fkey"
FOREIGN KEY ("referralOwnerId") REFERENCES "users"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "promo_code_redemptions"
ADD CONSTRAINT "promo_code_redemptions_rewardOwnerIdSnapshot_fkey"
FOREIGN KEY ("rewardOwnerIdSnapshot") REFERENCES "users"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_promoCodeId_fkey"
FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
