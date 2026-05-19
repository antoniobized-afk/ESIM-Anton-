-- Harden Phase 16 referral durability:
-- historical user attribution and referral bonus analytics must not be silently
-- nulled by deleting a referral link row.

ALTER TABLE "users" DROP CONSTRAINT "users_referralLinkId_fkey";
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_referralLinkId_fkey";

ALTER TABLE "users"
ADD CONSTRAINT "users_referralLinkId_fkey"
FOREIGN KEY ("referralLinkId") REFERENCES "referral_links"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_referralLinkId_fkey"
FOREIGN KEY ("referralLinkId") REFERENCES "referral_links"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
