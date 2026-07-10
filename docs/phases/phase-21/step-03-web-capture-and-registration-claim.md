# Step 03 — Web capture и registration claim

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Сделать web campaign entry trustworthy и связать anonymous touch с account без
cross-domain cookie assumptions или mutable registration analytics.

## Что нужно сделать

- Добавить thin client route `/r/[shortCode]`, opaque visitor/launch keys и
  public bounded capture endpoint.
- Реализовать authenticated idempotent claim: pending web touches связываются с
  canonical `User`, current first/last обновляется, registration snapshot
  finalizes только для newly created account state.
- Интегрировать claim with email/OAuth login bootstrap so registration facts
  cannot be inferred from a later campaign click by an existing user.
- Generated link may expose display UTM, but backend uses campaign code as
  authoritative input and rejects mismatch/no active campaign safely.
- Preserve existing `/ref/[code]` referral landing and its pending-referral
  behavior; no copy-paste tracking logic into `AuthProvider`.

## Результат шага

- Web campaign click создаёт один deduplicated touch.
- New account receives accurate registration first/last snapshot; existing
  account receives only current attribution update.
- Retry/reload does not create duplicate touch or detach another user’s state.
- No raw visitor id, referrer, IP or external redirect is persisted.

## Зависимости

- Step 02.

## Статус

`planned`

## Evidence

- Pending implementation.

## Файлы

- `client/app/r/[code]/**`
- `client/components/AuthProvider.tsx`
- `client/lib/{api,auth,security}.ts`
- `backend/src/modules/marketing-attribution/**`
- `backend/src/modules/auth/**`

## Тестирование / Верификация

- Anonymous campaign → new email/OAuth account → one registration snapshot.
- Existing account campaign click never changes registration snapshot.
- Refresh/retry/parallel claim creates no duplicate touch or cross-user link.
- Client route stays thin; auth redirect remains sanitized.
- Lookup: `INV-DTO-1`, `INV-AUTH-1`, `INV-SEC-1`, `INV-CLIENT-1`,
  `INV-TX-1`, `INV-VER-2..4`.
