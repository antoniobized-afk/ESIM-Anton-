# Step 04 — Telegram bot и Mini App trusted capture

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Подключить Telegram campaign links без untrusted `initDataUnsafe`, payload
collision с `ref_` и двойного capture между bot/Mini App paths.

## Что нужно сделать

- Ввести `ma_` parser namespace и отдельные generated links для bot `start` и
  Mini App `startapp`; соблюдать Telegram 64-character URL-safe limit.
- Изменить bot entry ordering так, чтобы campaign payload доступен до
  find-or-create decision; убрать redundant second registration call, если
  current session user уже есть.
- Добавить bot-only capture endpoint под `ServiceTokenGuard`, который сверяет
  canonical Telegram/user relation and produces idempotent event.
- Existing Mini App auth request already передаёт raw `initData`; извлечь из
  него `start_param` только внутри backend WebApp verification, после HMAC и
  `auth_date` freshness. В `AuthProvider` не добавлять отдельную передачу raw
  `start_param`: auth flow передаёт marketing owner уже verified launch intent.
- Mini App attribution не блокирует успешный login: owner сначала durable
  сохраняет verified launch intent без raw `initData`; capture выполняет только
  cron для `PENDING`/`FAILED`, не auth request. Existing non-campaign Mini App
  login не создаёт intent; successful intent удаляется, а `REJECTED` хранится
  семь дней для диагностики terminal identity/input/idempotency conflict.
- Сохранить `ref_` referral parser и existing bot/user identity behavior.

## Результат шага

- `start=ma_…` и `startapp=ma_…` independently capture one trusted touch.
- Replay/duplicate update не создаёт duplicate touch/referral side effect.
- Для `ma_` client-provided `initDataUnsafe.start_param` не является source of
  truth; `startapp=ma_…` из validated `initData` действительно доходит до
  capture. Existing `ref_` parser сохраняет свой отдельный flow.
- Existing `ref_` link и bot signup не регрессируют.

## Зависимости

- Step 02.

## Статус

`in_progress`

## Evidence

- `ma_` остаётся отдельным пространством имён ссылок Telegram, созданных на
  шаге 02. Capture service получил точку входа в существующей transaction,
  поэтому bot и Mini App не дублируют логику записи и идемпотентности.
- Bot разбирает `/start` payload до `find-or-create`; общая middleware не
  создаёт direct registration раньше `ma_` capture. Session owner устраняет
  повторный `find-or-create`, а `ref_` продолжает отдельную регистрацию через
  owner referrals даже при ошибке attribution capture.
- Добавлен service-token `POST /marketing-attribution/telegram/bot/capture`.
  Он сверяет canonical `UserIdentity(TELEGRAM, providerSubject)`; не-null
  legacy `User.telegramId` дополнительно проверяется на drift, но `null` не
  ломает explicit link. Endpoint принимает bounded idempotency key, создаёт
  только `TELEGRAM_BOT` touch и в той же transaction финализирует registration
  snapshot нового пользователя. `ref_` не создаёт marketing touch.
- `OAuthService` извлекает `start_param` и event key только после HMAC и
  проверки свежести `auth_date`. Для нового Mini App account resolver создаёт
  `MarketingMiniAppCaptureIntent` в той же transaction, что identity и
  registration eligibility. `AuthController` для existing `ma_` launch только
  ставит intent и никогда не ждёт marketing capture transaction; cron с
  lease/backoff доводит retryable intent до touch и snapshot. Successful intent
  удаляется, terminal `REJECTED` чистится через семь дней. Raw `initData`,
  Telegram hash и JWT в intent не пишутся; `AuthProvider` и `initDataUnsafe`
  flow не менялись. Mini App использует
  отдельный `TELEGRAM_MINI_APP` idempotency domain.
- Automated evidence: focused identity/attribution specs и full backend
  64 suites / 544 tests прошли; `pnpm --filter backend exec nest build` также
  зелёный. Prisma schema validation и `prisma generate --no-engine` прошли;
  полная генерация engine локально блокируется Windows `EPERM` при замене
  `query_engine-windows.dll.node`. Обычный `pnpm --filter bot build` —
  существующим `bot/tsconfig.json` `ignoreDeprecations: "6.0"` при TypeScript
  5.9.3. Проверка bot `tsc --noEmit --ignoreDeprecations 5.0` остаётся зелёной.
- До closure нужен manual smoke на настроенном runtime: bot update/retry,
  подписанный Mini App `initData`, отсутствие/ошибка service token и
  просроченный `auth_date`.
- Local backend runtime подтверждает загрузку нового маршрута: `POST
  /api/marketing-attribution/telegram/bot/capture` возвращает `401` без
  service token и `403` с неверным token; forged `POST
  /api/auth/telegram/webapp` возвращает `401`. Эти отрицательные проверки не
  делают записей и не заменяют положительный Telegram smoke.
- Аудит на оверинженеринг до prod: срезаны мёртвые `APPLIED` из
  `MarketingTelegramCaptureStatus` (schema + ещё не применённая миграция),
  дубль `finalizeRegistrationAttribution`, `findActiveCampaignByCode` и
  неиспользуемый result-контракт `attemptIntent`; анонимизация marketing-данных
  при user deletion перенесена в exported
  `MarketingAttributionLifecycleService.anonymizeUserMarketingData` (owner
  boundary). Граница «поведенческая веб-аналитика = внешний счётчик»
  зафиксирована в runtime doc. Полный прогон 64 suites / 544 tests, nest build
  и `prisma migrate dev` на локальной БД зелёные.

## Файлы

- `bot/src/{api,index,user-session,commands}/**`
- `backend/src/modules/auth/**`
- `backend/src/modules/marketing-attribution/**`

## Тестирование / Верификация

- Bot start for a new/existing user; same update retry; `ref_` regression.
- Valid/invalid/expired WebApp `initData`; `startapp=ma_…` must be extracted
  server-side and create capture, while `initDataUnsafe`/query-only imitation
  must not. The test fixture includes a signed `start_param` to prove delivery,
  not only parser behavior.
- Auth только durable enqueue-ит applicable launch и не ждёт capture; cron
  доводит retryable intent до exactly-one touch и registration snapshot,
  successful intent удаляется, а terminal identity/input conflict не делает
  бесконечных попыток и чистится через семь дней.
- Service-token endpoint rejects absent/wrong token and mismatched Telegram user.
- `pnpm --filter bot build` и affected backend gates; Mini App delivery
  подтверждается signed `initData` fixture и manual smoke, без изменения client
  implementation в этом step.
- Lookup: `INV-DTO-1`, `INV-TYPE-1`, `INV-AUTH-1`, `INV-SEC-1`,
  `INV-CLIENT-2`, `INV-VER-2..4`.
