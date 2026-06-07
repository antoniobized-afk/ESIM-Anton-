-- Phase 18 Step 2: additive identity ledger for account linking.
-- Runtime behavior is intentionally unchanged by this migration:
-- legacy users.authProvider/users.providerId stay in place until the resolver
-- is switched in a later step.
--
-- Required preflight before apply/backfill:
-- 1. Duplicate normalized emails:
--    SELECT lower(trim(email)) AS normalized_email, count(*)
--    FROM users
--    WHERE email IS NOT NULL AND trim(email) <> ''
--    GROUP BY lower(trim(email))
--    HAVING count(*) > 1;
-- 2. Duplicate legacy provider subjects:
--    SELECT upper(authProvider) AS provider, trim(providerId) AS provider_subject, count(*)
--    FROM users
--    WHERE authProvider IS NOT NULL AND providerId IS NOT NULL AND trim(providerId) <> ''
--    GROUP BY upper(authProvider), trim(providerId)
--    HAVING count(*) > 1;
-- 3. Incomplete/unknown legacy providers:
--    SELECT id, authProvider, providerId
--    FROM users
--    WHERE (authProvider IS NULL) <> (providerId IS NULL)
--       OR lower(authProvider) NOT IN ('email', 'telegram', 'google', 'yandex', 'vk');
-- 4. Telegram subject mismatch:
--    SELECT id, telegramId, providerId
--    FROM users
--    WHERE lower(authProvider) = 'telegram'
--      AND telegramId IS NOT NULL
--      AND trim(providerId) <> telegramId::text;
-- 5. Multiple subjects for one user/provider candidate:
--    WITH identity_candidates AS (
--      SELECT id, 'TELEGRAM' AS provider, telegramId::text AS provider_subject
--      FROM users
--      WHERE telegramId IS NOT NULL
--      UNION ALL
--      SELECT id, upper(trim(authProvider)) AS provider, trim(providerId) AS provider_subject
--      FROM users
--      WHERE authProvider IS NOT NULL
--        AND providerId IS NOT NULL
--        AND trim(providerId) <> ''
--        AND lower(authProvider) IN ('email', 'telegram', 'google', 'yandex', 'vk')
--      UNION ALL
--      SELECT id, 'EMAIL' AS provider, lower(trim(email)) AS provider_subject
--      FROM users
--      WHERE email IS NOT NULL AND trim(email) <> ''
--    )
--    SELECT id, provider, array_agg(DISTINCT provider_subject) AS provider_subjects
--    FROM identity_candidates
--    GROUP BY id, provider
--    HAVING count(DISTINCT provider_subject) > 1;
--
-- Rollback:
-- DROP TABLE IF EXISTS "user_identity_audit";
-- DROP TABLE IF EXISTS "user_identities";
-- DROP TYPE IF EXISTS "UserIdentityAuditActorType";
-- DROP TYPE IF EXISTS "UserIdentityAuditEvent";
-- DROP TYPE IF EXISTS "AuthIdentityProvider";

CREATE TYPE "AuthIdentityProvider" AS ENUM (
  'EMAIL',
  'TELEGRAM',
  'GOOGLE',
  'YANDEX',
  'VK'
);

CREATE TYPE "UserIdentityAuditEvent" AS ENUM (
  'BACKFILLED',
  'LINKED',
  'UNLINKED',
  'LOGIN_CONFLICT',
  'MERGE_PREFLIGHT',
  'MERGED'
);

CREATE TYPE "UserIdentityAuditActorType" AS ENUM (
  'SYSTEM',
  'USER',
  'ADMIN',
  'SUPPORT'
);

CREATE TABLE "user_identities" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AuthIdentityProvider" NOT NULL,
  "providerSubject" TEXT NOT NULL,
  "email" TEXT,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "displayName" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLoginAt" TIMESTAMP(3),
  "metadata" JSONB,

  CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_identity_audit" (
  "id" TEXT NOT NULL,
  "event" "UserIdentityAuditEvent" NOT NULL,
  "identityId" TEXT,
  "userId" TEXT,
  "actorType" "UserIdentityAuditActorType" NOT NULL,
  "actorId" TEXT,
  "provider" "AuthIdentityProvider",
  "providerSubjectHash" TEXT,
  "providerSubjectPreview" TEXT,
  "reason" TEXT,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_identity_audit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_identities_provider_providerSubject_key"
ON "user_identities"("provider", "providerSubject");

CREATE UNIQUE INDEX "user_identities_userId_provider_key"
ON "user_identities"("userId", "provider");

CREATE INDEX "user_identities_userId_idx"
ON "user_identities"("userId");

CREATE INDEX "user_identity_audit_identityId_idx"
ON "user_identity_audit"("identityId");

CREATE INDEX "user_identity_audit_userId_idx"
ON "user_identity_audit"("userId");

CREATE INDEX "user_identity_audit_event_createdAt_idx"
ON "user_identity_audit"("event", "createdAt");

ALTER TABLE "user_identities"
ADD CONSTRAINT "user_identities_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_identity_audit"
ADD CONSTRAINT "user_identity_audit_identityId_fkey"
FOREIGN KEY ("identityId") REFERENCES "user_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_identity_audit"
ADD CONSTRAINT "user_identity_audit_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
