ALTER TABLE "esim_products"
ADD COLUMN "dataType" INTEGER;

UPDATE "esim_products"
SET "dataType" = 1
WHERE "isUnlimited" = false;

ALTER TABLE "esim_products"
ALTER COLUMN "dataType" SET DEFAULT 1;

ALTER TABLE "esim_products"
ADD CONSTRAINT "esim_products_dataType_check"
CHECK ("dataType" IS NULL OR "dataType" IN (1, 2, 3, 4));

CREATE INDEX "esim_products_dataType_idx" ON "esim_products"("dataType");
