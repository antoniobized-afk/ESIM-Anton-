-- Preflight before applying the partial unique index:
-- SELECT "userId", "orderId", COUNT(*) AS duplicate_count
-- FROM transactions
-- WHERE type = 'REFERRAL_BONUS' AND "orderId" IS NOT NULL
-- GROUP BY "userId", "orderId"
-- HAVING COUNT(*) > 1;
--
-- Rollback note for the raw partial unique index:
-- DROP INDEX IF EXISTS transactions_referral_bonus_once_per_referrer_order;

-- CreateEnum
CREATE TYPE "PromoCodeSource" AS ENUM ('MANUAL', 'REFERRAL_LINK_AUTO');

-- CreateEnum
CREATE TYPE "PromoCodeRedemptionSource" AS ENUM ('REFERRAL_LINK_AUTO');

-- CreateEnum
CREATE TYPE "PromoCodeRedemptionStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "referralLinkId" TEXT,
ADD COLUMN "pendingPromoCode" TEXT;

-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "promoCodeSource" "PromoCodeSource";

-- AlterTable
ALTER TABLE "transactions"
ADD COLUMN "referralLinkId" TEXT;

-- CreateTable
CREATE TABLE "referral_links" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "bonusPercent" DECIMAL(5,2) NOT NULL,
    "promoCodeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_code_redemptions" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "source" "PromoCodeRedemptionSource" NOT NULL,
    "status" "PromoCodeRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "promo_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_links_code_key" ON "referral_links"("code");

-- CreateIndex
CREATE INDEX "users_referralLinkId_idx" ON "users"("referralLinkId");

-- CreateIndex
CREATE INDEX "transactions_referralLinkId_idx" ON "transactions"("referralLinkId");

-- CreateIndex
CREATE INDEX "referral_links_userId_idx" ON "referral_links"("userId");

-- CreateIndex
CREATE INDEX "referral_links_promoCodeId_idx" ON "referral_links"("promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "promo_code_redemptions_orderId_key" ON "promo_code_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "promo_code_redemptions_promoCodeId_status_idx" ON "promo_code_redemptions"("promoCodeId", "status");

-- CreateIndex
CREATE INDEX "promo_code_redemptions_userId_status_idx" ON "promo_code_redemptions"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX transactions_referral_bonus_once_per_referrer_order
ON transactions ("userId", "orderId")
WHERE type = 'REFERRAL_BONUS' AND "orderId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "referral_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "referral_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
