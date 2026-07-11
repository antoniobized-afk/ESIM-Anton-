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

`completed`

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
- Closure evidence 2026-07-11: оператор подтвердил работу production rollout
  и положительные live Telegram flows `/start ma_…` и `startapp=ma_…` на
  настроенном transport runtime. Ранее закрытые negative/retry/idempotency
  paths остаются подтверждены automated и synthetic runtime evidence ниже.
- Local backend runtime подтверждает загрузку нового маршрута: `POST
  /api/marketing-attribution/telegram/bot/capture` возвращает `401` без
  service token и `403` с неверным token; forged `POST
  /api/auth/telegram/webapp` возвращает `401`. Эти отрицательные проверки не
  делают записей и не заменяют положительный Telegram smoke.
- Закрыты подтверждённые пункты внешнего код-ревью (`docs/audits/audit.md`):
  service-token capture endpoint переведён на `@SkipThrottle()` (per-IP лимит
  терял touches при >60/мин с IP бота); bot session стала per-user через
  `getSessionKey = ctx.from.id`, `/start` всегда резолвит canonical user свежим
  find-or-create (групповой чат больше не отдаёт чужой `userId` в referral и
  capture); bot API получил `timeout: 10s` и bounded retry (2 повтора,
  network/429/5xx) для capture; окно `auth_date` WebApp initData сужено с 24ч
  до 1ч (`TELEGRAM_WEBAPP_AUTH_DATE_MAX_AGE_SECONDS`, зафиксировано в
  `auth-identity-runtime.md`), Login Widget окно не менялось. Backend
  64 suites / 544 tests и `nest build` зелёные; bot type gate
  `tsc --noEmit --ignoreDeprecations 5.0` зелёный.
- Аудит на оверинженеринг до prod: срезаны мёртвые `APPLIED` из
  `MarketingTelegramCaptureStatus` (schema + ещё не применённая миграция),
  дубль `finalizeRegistrationAttribution`, `findActiveCampaignByCode` и
  неиспользуемый result-контракт `attemptIntent`; анонимизация marketing-данных
  при user deletion перенесена в exported
  `MarketingAttributionLifecycleService.anonymizeUserMarketingData` (owner
  boundary). Граница «поведенческая веб-аналитика = внешний счётчик»
  зафиксирована в runtime doc. Полный прогон 64 suites / 544 tests, nest build
  и `prisma migrate dev` на локальной БД зелёные.
- Step 08 устранил ложный canonical build blocker: `bot/tsconfig.json`
  использует поддерживаемый TypeScript 5.9 уровень `ignoreDeprecations: "5.0"`;
  `pnpm --filter bot build` green. Full backend 73 suites / 576 tests green;
  signed `initData` fixture, bot owner/controller, Mini App intent/cron,
  identity drift, retry и service-token negative paths проходят.
- Положительный backend runtime smoke выполнен на disposable PostgreSQL и
  synthetic credentials без чтения `.env`: service-token bot capture + retry
  создали ровно один `TELEGRAM_BOT` touch; два запроса с корректно подписанным
  Mini App `initData` сохранили один intent, cron создал ровно один
  `TELEGRAM_MINI_APP` touch и удалил intent. Оба registration snapshot стали
  `ATTRIBUTED`; повтор bot capture вернул accepted без повторной финализации.
- Production credentials по-прежнему не читались агентом: внешний gate закрыт
  операторским подтверждением live transport, без нарушения Isolation Gate.

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
