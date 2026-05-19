-- Adds a durable marker for one-shot purchase completion accounting.
-- Rollback note:
-- ALTER TABLE "orders" DROP COLUMN IF EXISTS "completionAccountingAppliedAt";

ALTER TABLE "orders"
ADD COLUMN "completionAccountingAppliedAt" TIMESTAMP(3);
