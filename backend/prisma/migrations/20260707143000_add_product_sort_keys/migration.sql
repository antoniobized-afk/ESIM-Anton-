ALTER TABLE "esim_products"
ADD COLUMN "dataAmountMb" DECIMAL(14,4),
ADD COLUMN "providerCostPerGb" DECIMAL(18,6),
ADD COLUMN "markupRatio" DECIMAL(18,6);

WITH normalized AS (
  SELECT
    "id",
    CASE
      WHEN "dataAmount" ~* '^[[:space:]]*([0-9]+([.,][0-9]+)?)[[:space:]]*GB[[:space:]]*$' THEN
        replace(
          regexp_replace(
            "dataAmount",
            '^[[:space:]]*([0-9]+([.,][0-9]+)?)[[:space:]]*GB[[:space:]]*$',
            '\1',
            'i'
          ),
          ',',
          '.'
        )::numeric * 1024
      WHEN "dataAmount" ~* '^[[:space:]]*([0-9]+([.,][0-9]+)?)[[:space:]]*MB[[:space:]]*$' THEN
        replace(
          regexp_replace(
            "dataAmount",
            '^[[:space:]]*([0-9]+([.,][0-9]+)?)[[:space:]]*MB[[:space:]]*$',
            '\1',
            'i'
          ),
          ',',
          '.'
        )::numeric
      ELSE NULL
    END AS "dataAmountMb"
  FROM "esim_products"
)
UPDATE "esim_products" AS product
SET
  "dataAmountMb" = normalized."dataAmountMb",
  "providerCostPerGb" = CASE
    WHEN normalized."dataAmountMb" IS NOT NULL AND normalized."dataAmountMb" > 0
      THEN product."providerPrice" / (normalized."dataAmountMb" / 1024)
    ELSE NULL
  END,
  "markupRatio" = CASE
    WHEN product."providerPrice" > 0 THEN product."ourPrice" / product."providerPrice"
    ELSE NULL
  END
FROM normalized
WHERE product."id" = normalized."id";

UPDATE "esim_products"
SET
  "badge" = NULLIF(btrim("badge"), ''),
  "badgeColor" = CASE
    WHEN NULLIF(btrim("badge"), '') IS NULL THEN NULL
    ELSE NULLIF(btrim("badgeColor"), '')
  END
WHERE "badge" IS NOT NULL OR "badgeColor" IS NOT NULL;

CREATE INDEX "esim_products_dataAmountMb_idx" ON "esim_products"("dataAmountMb");
CREATE INDEX "esim_products_providerCostPerGb_idx" ON "esim_products"("providerCostPerGb");
CREATE INDEX "esim_products_markupRatio_idx" ON "esim_products"("markupRatio");
