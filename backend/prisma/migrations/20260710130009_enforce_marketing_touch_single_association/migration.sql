-- Normalize any rows written before the single-association invariant.
UPDATE "marketing_touches"
SET "visitorKeyHash" = NULL
WHERE "userId" IS NOT NULL
  AND "visitorKeyHash" IS NOT NULL;

-- A touch is either user-associated or pending by visitor HMAC.
-- Both NULL remains valid for anonymized historical facts after user deletion.
ALTER TABLE "marketing_touches"
ADD CONSTRAINT "marketing_touches_single_association_check"
CHECK ("userId" IS NULL OR "visitorKeyHash" IS NULL);
