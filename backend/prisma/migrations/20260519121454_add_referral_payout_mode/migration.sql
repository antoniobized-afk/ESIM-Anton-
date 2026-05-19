-- CreateEnum
CREATE TYPE "ReferralPayoutMode" AS ENUM ('BALANCE', 'EXTERNAL');

-- AlterTable
ALTER TABLE "referral_links" ADD COLUMN     "payoutMode" "ReferralPayoutMode" NOT NULL DEFAULT 'BALANCE';
