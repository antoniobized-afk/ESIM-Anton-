# Шаг 7. Verification, rollout и wiki sync

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Закрыть фазу проверкой миграции, auth flows, downstream ownership invariants и
обновлением durable wiki.

## Что нужно сделать

- Прогнать backend targeted tests и type-check.
- Прогнать client/admin/bot type-check для затронутых clients.
- Провести manual smoke:
  - email login;
  - OAuth login без silent email merge;
  - OAuth link с signed state и conflict cases;
  - Telegram Widget;
  - Telegram WebApp;
  - bot `/start`;
  - checkout purchase;
  - saved-card charge;
  - referral registration;
  - partner promo reward;
  - notifications.
- Подготовить DB migration preflight для production.
- Зафиксировать rollout gates:
  - additive migration applied;
  - preflight report green или все conflicts classified;
  - backfill idempotency verified;
  - legacy fields not removed;
  - rollback plan для raw/partial indexes documented.
- Обновить `docs/architecture/auth-identity-runtime.md` по фактической
  реализации.
- Обновить `docs/architecture/module-map.md`, если появились новые services или
  admin/client pages.
- Обновить `docs/architecture/gotchas.md`, если найдены migration/auth risks.

## Результат шага

- Phase 18 готова к deploy только после green verification и migration preflight.
- Wiki отражает фактический runtime, а не первоначальный план.
- Если support merge mutation не включена, docs явно говорят, что доступен
  только read-only duplicate preflight.

## Зависимости

- Шаги 2-6.

## Статус

`implemented-local, pending DB rollout and manual smoke`

## Журнал изменений

### 2026-06-06

- Шаг запланирован как mandatory final verification gate.

### 2026-06-07

- Локально прогнан объединенный targeted backend suite по affected surfaces:
  `auth`, `users`, `orders`, `payments`, `referrals`, `promo-codes`.
  Результат после latest hardening pass: 22 suites / 200 tests passed.
- Пройдены compile gates:
  - backend `npx tsc --noEmit -p tsconfig.json`;
  - client `npx tsc --noEmit`;
  - admin `npx tsc --noEmit`;
  - bot `npx tsc --noEmit`.
- Пройден `npx prisma validate` в `backend`.
- Wiki обновлена по фактической реализации:
  - `auth-identity-runtime.md` описывает SRP backfill, resolver, management API
    и read-only merge preflight;
  - `module-map.md` отражает новые auth/users sub-boundaries;
  - `gotchas.md` фиксирует migration-first rollout и OAuth link-state fallback
    risk.
- Дополнительно закрыт hardening gap по OAuth link-state: production больше не
  использует development fallback secret, а explicit link audit пишет source
  `identity_management_explicit_link`.
- Дополнительно закрыт email-identity collision gap: OAuth login/link теперь
  считает занятым не только `User.email`, но и существующий
  `UserIdentity(EMAIL, providerSubject)` другого пользователя; email-link
  endpoints получили OTP throttling, а signed `returnTo` нормализует
  backslash/encoded-backslash variants.
- Дополнительно закрыт callback/race hardening: invalid signed OAuth link-state
  в controller редиректит в profile identity error и не запускает login
  fallback; concurrent unique race при создании identity превращается в
  controlled provider conflict, а не raw Prisma error.
- Дополнительно закрыт OAuth returnTo hardening: обычный OAuth login `state`
  нормализуется на backend как relative path, а signed link-state использует
  тот же helper с fallback `/profile`.
- Дополнительно закрыт input-contract hardening: новые fixed-shape
  identity-link body payloads вынесены в DTO и покрыты validation tests;
  Telegram Widget payload остается динамическим для проверки подписи.
- Дополнительно закрыт legacy auth/bot input-contract hardening: email OTP
  login, Telegram WebApp auth и bot `users/find-or-create` используют DTO, а
  Telegram Widget остается dynamic signed payload exception.
- Дополнительно закреплен provider-per-user invariant: schema/migration имеют
  unique `(userId, provider)`, backfill preflight блокирует несколько subjects
  одного provider для одного user, runtime link/resolver возвращает controlled
  conflict вместо создания второго active row.
- Дополнительно закрыт audit gap: resolver и explicit link conflicts пишут
  `LOGIN_CONFLICT` audit с masked/hash subject и safe metadata, публичные
  conflict responses не раскрывают owner `User.id`, а audit для неуспешного
  explicit link пишется вне rollback-transaction.
- Дополнительно закрыт audit snapshot privacy gap: `LINKED`, `UNLINKED` и
  `BACKFILLED` snapshots больше не хранят raw email; используется
  `emailHash/emailPreview`.
- Дополнительно закрыт merge-preflight audit gap: read-only admin/support
  preflight пишет `MERGE_PREFLIGHT` audit для source/target users, но не
  выполняет data-moving merge.
- Дополнительно закрыт contact-email split-brain gap: contact email update
  проверяет занятость `UserIdentity(EMAIL)` другого пользователя, а explicit
  OAuth link не обходит такую collision через совпавший `User.email` текущего
  пользователя.
- Дополнительно закрыт Telegram split-brain gap: login/link блокирует drift
  между `TELEGRAM` identity и `users.telegramId` другого пользователя или
  identity owner.
- Phase 18 остается pending к production deploy до применения additive
  migration, запуска identity backfill dry-run/apply на реальной БД и ручного
  smoke по login/link/unlink/downstream flows.

## Файлы

- `docs/architecture/auth-identity-runtime.md`
- `docs/architecture/module-map.md`
- `docs/architecture/gotchas.md`
- `docs/phases/phase-18-account-identity-linking-and-merge.md`
- `docs/phases/phase-18/*`

## Тестирование / Верификация

- Backend targeted Jest suite.
- Backend type-check.
- Client/admin/bot type-check as applicable.
- Production migration preflight before `prisma migrate deploy`.
- `git diff --check`.

Локально выполнено 2026-06-07:

```bash
npx jest modules/auth/ modules/users/ modules/orders/orders.service.spec.ts modules/payments/cloudpayments.service.spec.ts modules/payments/payments.service.spec.ts modules/referrals/ modules/promo-codes/ scripts/phase18-user-identity-backfill-cli.spec.ts --runInBand
npx jest modules/auth/ --runInBand
npx tsc --noEmit -p tsconfig.json
npx prisma validate
```

```bash
# client
npx tsc --noEmit

# admin
npx tsc --noEmit

# bot
npx tsc --noEmit
```

Production/dev DB gates, которые не заменяются unit tests:

- `npx prisma migrate deploy`;
- `npm run phase18:identity-backfill` dry-run;
- классификация blocking conflicts;
- `npm run phase18:identity-backfill -- --apply --confirm-phase18-identity-backfill`;
- повторный dry-run на идемпотентность;
- manual smoke по email/OAuth/Telegram/bot/checkout/saved-card/referral/promo
  flows.
