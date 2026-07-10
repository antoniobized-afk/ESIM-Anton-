-- Mini App attribution is best-effort for login availability, but durable for
-- marketing delivery. This table stores only server-verified launch facts, not
-- raw initData, Telegram hash or JWT.
CREATE TYPE "MarketingTelegramCaptureStatus" AS ENUM ('PENDING', 'FAILED', 'REJECTED');

CREATE TABLE "marketing_mini_app_capture_intents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "startParam" TEXT,
    "sourceEventKey" TEXT NOT NULL,
    "status" "MarketingTelegramCaptureStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_mini_app_capture_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_mini_app_capture_intents_sourceEventKey_key"
ON "marketing_mini_app_capture_intents"("sourceEventKey");

CREATE INDEX "marketing_mini_app_capture_intents_status_nextRetryAt_idx"
ON "marketing_mini_app_capture_intents"("status", "nextRetryAt");

CREATE INDEX "marketing_mini_app_capture_intents_userId_createdAt_idx"
ON "marketing_mini_app_capture_intents"("userId", "createdAt");

ALTER TABLE "marketing_mini_app_capture_intents"
ADD CONSTRAINT "marketing_mini_app_capture_intents_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
