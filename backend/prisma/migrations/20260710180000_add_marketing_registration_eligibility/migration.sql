-- Только account, созданный после запуска marketing attribution, может
-- финализировать registration snapshot. Existing user получает current touch,
-- но не synthetic registration fact от позднего клика.
ALTER TABLE "user_marketing_attribution"
ADD COLUMN "registrationEligibleAt" TIMESTAMP(3);
