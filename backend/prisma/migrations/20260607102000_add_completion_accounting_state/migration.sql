-- Добавляет явное retry-состояние для purchase completion accounting.
-- Rollback:
-- DROP INDEX IF EXISTS "orders_completion_accounting_retry_idx";
-- ALTER TABLE "orders"
--   DROP COLUMN IF EXISTS "completionAccountingLastError",
--   DROP COLUMN IF EXISTS "completionAccountingNextRetryAt",
--   DROP COLUMN IF EXISTS "completionAccountingLastAttemptAt",
--   DROP COLUMN IF EXISTS "completionAccountingAttempts",
--   DROP COLUMN IF EXISTS "completionAccountingStatus";
-- DROP TYPE IF EXISTS "CompletionAccountingStatus";

CREATE TYPE "CompletionAccountingStatus" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'APPLIED',
  'FAILED'
);

ALTER TABLE "orders"
ADD COLUMN "completionAccountingStatus" "CompletionAccountingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "completionAccountingAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "completionAccountingLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "completionAccountingNextRetryAt" TIMESTAMP(3),
ADD COLUMN "completionAccountingLastError" TEXT;

UPDATE "orders"
SET "completionAccountingStatus" = 'APPLIED'
WHERE "completionAccountingAppliedAt" IS NOT NULL;

CREATE INDEX "orders_completion_accounting_retry_idx"
ON "orders"("completionAccountingStatus", "completionAccountingNextRetryAt");
