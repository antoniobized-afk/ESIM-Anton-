-- CreateEnum
CREATE TYPE "MarketingTouchChannel" AS ENUM ('WEB', 'TELEGRAM_BOT', 'TELEGRAM_MINI_APP');

-- CreateEnum
CREATE TYPE "MarketingRegistrationAttributionStatus" AS ENUM ('PENDING', 'DIRECT', 'ATTRIBUTED');

-- CreateEnum
CREATE TYPE "MarketingCampaignAuditEvent" AS ENUM ('CREATED', 'UPDATED', 'ACTIVATED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "targetPath" TEXT NOT NULL,
    "referralLinkId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_touches" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" "MarketingTouchChannel" NOT NULL,
    "sourceEventKey" TEXT NOT NULL,
    "visitorKeyHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_touches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_marketing_attribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstTouchId" TEXT,
    "firstTouchOccurredAt" TIMESTAMP(3),
    "lastTouchId" TEXT,
    "lastTouchOccurredAt" TIMESTAMP(3),
    "registrationStatus" "MarketingRegistrationAttributionStatus" NOT NULL DEFAULT 'PENDING',
    "registrationFinalizedAt" TIMESTAMP(3),
    "registrationFirstTouchId" TEXT,
    "registrationLastTouchId" TEXT,
    "registrationFirstCampaignId" TEXT,
    "registrationFirstCampaignCode" TEXT,
    "registrationFirstCampaignName" TEXT,
    "registrationFirstUtmSource" TEXT,
    "registrationFirstUtmMedium" TEXT,
    "registrationFirstUtmCampaign" TEXT,
    "registrationFirstUtmContent" TEXT,
    "registrationFirstUtmTerm" TEXT,
    "registrationFirstChannel" "MarketingTouchChannel",
    "registrationFirstOccurredAt" TIMESTAMP(3),
    "registrationLastCampaignId" TEXT,
    "registrationLastCampaignCode" TEXT,
    "registrationLastCampaignName" TEXT,
    "registrationLastUtmSource" TEXT,
    "registrationLastUtmMedium" TEXT,
    "registrationLastUtmCampaign" TEXT,
    "registrationLastUtmContent" TEXT,
    "registrationLastUtmTerm" TEXT,
    "registrationLastChannel" "MarketingTouchChannel",
    "registrationLastOccurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_marketing_attribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_marketing_attribution" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "firstTouchId" TEXT,
    "lastTouchId" TEXT,
    "firstCampaignId" TEXT,
    "firstCampaignCode" TEXT,
    "firstCampaignName" TEXT,
    "firstUtmSource" TEXT,
    "firstUtmMedium" TEXT,
    "firstUtmCampaign" TEXT,
    "firstUtmContent" TEXT,
    "firstUtmTerm" TEXT,
    "firstChannel" "MarketingTouchChannel",
    "firstOccurredAt" TIMESTAMP(3),
    "lastCampaignId" TEXT,
    "lastCampaignCode" TEXT,
    "lastCampaignName" TEXT,
    "lastUtmSource" TEXT,
    "lastUtmMedium" TEXT,
    "lastUtmCampaign" TEXT,
    "lastUtmContent" TEXT,
    "lastUtmTerm" TEXT,
    "lastChannel" "MarketingTouchChannel",
    "lastOccurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_marketing_attribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_campaign_audits" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "event" "MarketingCampaignAuditEvent" NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" "AdminRole" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaign_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_campaigns_shortCode_key" ON "marketing_campaigns"("shortCode");

-- CreateIndex
CREATE INDEX "marketing_campaigns_isActive_createdAt_idx" ON "marketing_campaigns"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_campaigns_referralLinkId_idx" ON "marketing_campaigns"("referralLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_touches_sourceEventKey_key" ON "marketing_touches"("sourceEventKey");

-- CreateIndex
CREATE INDEX "marketing_touches_campaignId_occurredAt_idx" ON "marketing_touches"("campaignId", "occurredAt");

-- CreateIndex
CREATE INDEX "marketing_touches_userId_occurredAt_idx" ON "marketing_touches"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "marketing_touches_visitorKeyHash_occurredAt_idx" ON "marketing_touches"("visitorKeyHash", "occurredAt");

-- CreateIndex
CREATE INDEX "marketing_touches_channel_occurredAt_idx" ON "marketing_touches"("channel", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_marketing_attribution_userId_key" ON "user_marketing_attribution"("userId");

-- CreateIndex
CREATE INDEX "user_marketing_attribution_registrationStatus_registrationF_idx" ON "user_marketing_attribution"("registrationStatus", "registrationFinalizedAt");

-- CreateIndex
CREATE INDEX "user_marketing_attribution_registrationFirstCampaignId_idx" ON "user_marketing_attribution"("registrationFirstCampaignId");

-- CreateIndex
CREATE INDEX "user_marketing_attribution_registrationLastCampaignId_idx" ON "user_marketing_attribution"("registrationLastCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "order_marketing_attribution_orderId_key" ON "order_marketing_attribution"("orderId");

-- CreateIndex
CREATE INDEX "order_marketing_attribution_firstCampaignId_idx" ON "order_marketing_attribution"("firstCampaignId");

-- CreateIndex
CREATE INDEX "order_marketing_attribution_lastCampaignId_idx" ON "order_marketing_attribution"("lastCampaignId");

-- CreateIndex
CREATE INDEX "marketing_campaign_audits_campaignId_createdAt_idx" ON "marketing_campaign_audits"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_campaign_audits_actorId_createdAt_idx" ON "marketing_campaign_audits"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "referral_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_touches" ADD CONSTRAINT "marketing_touches_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_touches" ADD CONSTRAINT "marketing_touches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_marketing_attribution" ADD CONSTRAINT "user_marketing_attribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_marketing_attribution" ADD CONSTRAINT "user_marketing_attribution_firstTouchId_fkey" FOREIGN KEY ("firstTouchId") REFERENCES "marketing_touches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_marketing_attribution" ADD CONSTRAINT "user_marketing_attribution_lastTouchId_fkey" FOREIGN KEY ("lastTouchId") REFERENCES "marketing_touches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_marketing_attribution" ADD CONSTRAINT "user_marketing_attribution_registrationFirstTouchId_fkey" FOREIGN KEY ("registrationFirstTouchId") REFERENCES "marketing_touches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_marketing_attribution" ADD CONSTRAINT "user_marketing_attribution_registrationLastTouchId_fkey" FOREIGN KEY ("registrationLastTouchId") REFERENCES "marketing_touches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_marketing_attribution" ADD CONSTRAINT "user_marketing_attribution_registrationFirstCampaignId_fkey" FOREIGN KEY ("registrationFirstCampaignId") REFERENCES "marketing_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_marketing_attribution" ADD CONSTRAINT "user_marketing_attribution_registrationLastCampaignId_fkey" FOREIGN KEY ("registrationLastCampaignId") REFERENCES "marketing_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_marketing_attribution" ADD CONSTRAINT "order_marketing_attribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_marketing_attribution" ADD CONSTRAINT "order_marketing_attribution_firstTouchId_fkey" FOREIGN KEY ("firstTouchId") REFERENCES "marketing_touches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_marketing_attribution" ADD CONSTRAINT "order_marketing_attribution_lastTouchId_fkey" FOREIGN KEY ("lastTouchId") REFERENCES "marketing_touches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_marketing_attribution" ADD CONSTRAINT "order_marketing_attribution_firstCampaignId_fkey" FOREIGN KEY ("firstCampaignId") REFERENCES "marketing_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_marketing_attribution" ADD CONSTRAINT "order_marketing_attribution_lastCampaignId_fkey" FOREIGN KEY ("lastCampaignId") REFERENCES "marketing_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaign_audits" ADD CONSTRAINT "marketing_campaign_audits_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
