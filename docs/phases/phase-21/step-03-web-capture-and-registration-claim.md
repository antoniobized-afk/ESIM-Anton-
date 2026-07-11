# Step 03 — Web capture и registration claim

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Сделать web campaign entry trustworthy и связать anonymous touch с account без
cross-domain cookie assumptions или mutable registration analytics.

## Что нужно сделать

- Добавить thin client route `/r/[shortCode]`, opaque visitor/launch keys и
  public bounded capture endpoint.
- Реализовать authenticated idempotent claim: pending web touches одной
  атомарной мутацией получают canonical `userId` и теряют visitor HMAC;
  current first/last обновляется, registration snapshot finalizes только для
  newly created account state.
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

`completed`

## Evidence

- Реализованы thin route `client/app/r/[shortCode]`, first-party opaque
  visitor/launch storage и bounded public `POST /marketing-attribution/web/capture`.
  Browser не передаёт UTM/referral policy; backend строит HMAC visitor key и
  сохраняет только HMAC + opaque idempotency key.
- `POST /marketing-attribution/web/claim` защищён `JwtUserGuard`: одной
  SQL-мутацией назначает canonical `userId` всем pending WEB touches, очищает
  visitor HMAC, затем в той же transaction обновляет current first/last.
  Cross-user association и anonymous replay claimed source-event key остаются
  conflict-safe в owner capture service.
- Новый email/OAuth account получает durable `registrationEligibleAt` в той же
  transaction, что создание `User`; claim финализирует `ATTRIBUTED` или
  `DIRECT` только при этом marker. Existing user от позднего click получает
  current attribution без synthetic registration snapshot. Telegram исключён:
  его trusted boundary остаётся Step 04.
- `AuthProvider` вызывает idempotent claim после fresh web login и после
  campaign-capture event, но не на bootstrap восстановленной сессии; visitor
  token сохраняется до logout, launch key изолирован tab session, поэтому
  in-flight capture в параллельной вкладке не теряет association key. Claim
  одной CTE-мутацией привязывает весь pending batch, а lifecycle получает только
  deterministic earliest/latest representatives без N+1 writes. Referral
  one-shot не переписан и `/ref/[code]` не менялся.
- Step 08 закрыл оставшиеся gates: все 26 migrations применены на чистой
  PostgreSQL 16, `prisma migrate status` и `prisma validate` green. Реальный
  production client route `/r/<shortCode>` отправил capture в backend и после
  redirect открыл каталог; два browser retry дали ровно один WEB touch в БД.
- Registration/order интеграция подтверждена conditional DB-spec: trusted WEB
  touch финализирует immutable registration attribution, primary completed
  order получает snapshot, top-up остаётся без него. Existing-user, conflict,
  parallel claim и email/OAuth branches остаются покрыты owner specs.
- Client gate исправлен как контракт, а не флагом обхода: `NEXT_PUBLIC_API_URL`
  трактуется как backend origin, `/api` добавляет общий `client/lib/api-url.ts`;
  OAuth использует тот же owner. Удалены `ignoreBuildErrors` и
  `ignoreDuringBuilds`, `ignoreDeprecations` согласован с TypeScript 5.9.3.
  Client lint, `tsc --noEmit` и production build green.

## Файлы

- `client/app/r/[shortCode]/**`
- `client/components/AuthProvider.tsx`
- `client/lib/{api,auth,security}.ts`
- `backend/src/modules/marketing-attribution/**`
- `backend/src/modules/auth/**`

## Тестирование / Верификация

- Anonymous campaign → new email/OAuth account → one registration snapshot.
- Existing account campaign click never changes registration snapshot.
- Refresh/retry/parallel claim creates no duplicate touch or cross-user link.
- Pending anonymous retry возвращает same touch, но anonymous retry уже
  claimed source-event key получает conflict без canonical `userId`; trusted
  user retry с той же association остаётся идемпотентным.
- Client route stays thin; auth redirect remains sanitized.
- Lookup: `INV-DTO-1`, `INV-AUTH-1`, `INV-SEC-1`, `INV-CLIENT-1`,
  `INV-TX-1`, `INV-VER-2..4`.
