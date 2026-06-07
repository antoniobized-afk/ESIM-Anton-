# Phase 18: Account Identity Linking & Merge

> [Корневой документ wiki](../README.md)

## Цель

Вынести способы входа пользователя из legacy slot `User.authProvider/providerId`
в durable identity model, чтобы один canonical бизнес-аккаунт мог безопасно
иметь Telegram, email, Google, Yandex и VK identities без silent merge,
потери заказов, платежных токенов, referral/promo ownership и уведомлений.

Фаза не является маленькой UI-доработкой. Это архитектурное изменение account
boundary.

## Результат

- `User` остается canonical business account для денег, заказов, eSIM,
  referral ownership, partner rewards, saved cards и notification targets.
- Появляется `UserIdentity` как отдельная таблица способов входа.
- Существующие пользователи получают backfilled identities без удаления legacy
  полей в том же шаге.
- Email, OAuth, Telegram Widget, Telegram WebApp и bot registration используют
  общий identity resolver.
- JWT продолжает выдаваться на canonical `user.id`.
- OAuth больше не делает silent link/merge по одному совпавшему email.
- Появляется read-only user-facing surface для просмотра привязанных способов
  входа.
- Link/unlink provider-ов становится явным действием авторизованного
  пользователя с conflict handling.
- Admin/support получает preflight/audit контур для дублей и merge decisions.
  Автоматический merge в login flow запрещен.
- Runtime wiki фиксирует новый contract и affected downstream surfaces.

## Оценка

- Размер фазы: `large`
- Ожидаемое число шагов: `7`
- Основные риски:
  - silent merge двух разных пользователей по email;
  - потеря доступа к аккаунту после переключения login resolver;
  - перенос заказов, баланса или payment tokens внутри auth flow;
  - конфликт Telegram как login identity и notification chat id;
  - нарушение referral/promo owner contracts из Phase 16/17;
  - выдача JWT на неправильный canonical `User.id`;
  - удаление последнего usable login identity;
  - миграция без preflight по duplicate provider subjects.

## Зависит от

- [Phase 3: Admin Auth & API Security Hardening](./phase-3-admin-auth-and-api-security.md)
- [Phase 10: Client Runtime, Payments & Provider Hardening](./phase-10-client-payments-and-provider-hardening.md)
- [Phase 11: Admin Panel Refactoring](./phase-11-admin-panel-refactoring.md)
- [Phase 15: Payment & Webhook Security Hardening](./phase-15-payment-and-webhook-security-hardening.md)
- [Phase 16: Partner Referral Links](./phase-16-partner-referral-links.md)
- [Phase 17: Partner Promo Codes](./phase-17-partner-promo-codes.md)
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Promo Codes Runtime](../architecture/promo-codes-runtime.md)

## Пререквизиты

- Подтверждены текущие auth routes:
  - `POST /auth/email/send-code`;
  - `POST /auth/email/verify`;
  - `GET /auth/oauth/:provider/redirect`;
  - `GET /auth/oauth/:provider/callback`;
  - `POST /auth/telegram`;
  - `POST /auth/telegram/webapp`;
  - `GET /auth/me`.
- Подтверждено, что `JwtUserGuard` использует `sub=user.id`.
- Подтверждено, что `POST /users/find-or-create` является bot-only mutation с
  `ServiceTokenGuard`.
- Подтверждено, что order/payment/referral/promo/notification ownership идет
  через canonical `User.id`.
- Перед миграцией нужен DB preflight по:
  - duplicate `telegramId`;
  - duplicate `email`;
  - duplicate `(authProvider, providerId)`;
  - пользователям с заполненным `email`, но без verified email-login истории;
  - пользователям, где `authProvider/providerId` конфликтует с
    `telegramId/email`.
- До link/unlink UI нужно продуктово зафиксировать copy и поведение для:
  - provider already linked to another account;
  - email already used by another account;
  - unlink last identity;
  - Telegram identity vs Telegram notification channel.

## Архитектурные решения

- `User` не переименовывать и не превращать в auth identity. Он остается
  canonical business account.
- Ввести отдельную `UserIdentity` model:
  - `provider`;
  - `providerSubject`;
  - `email?`;
  - `emailVerified`;
  - `displayName?`;
  - `linkedAt`;
  - `lastLoginAt`;
  - `metadata?`;
  - `@@unique([provider, providerSubject])`;
  - `@@index([userId])`.
- Не использовать legacy `User.authProvider/providerId` как расширяемую модель.
  Эти поля остаются transitional compatibility fields до отдельного deprecation
  шага.
- JWT payload не должен тащить identity id как authorization subject. `sub`
  остается `User.id`; identity id может быть audit metadata, но не owner key.
- OAuth login с unknown provider subject и email, совпавшим с существующим
  `User.email`, не должен автоматически привязывать provider. Без уже
  авторизованной сессии это conflict / account-exists flow.
- Link нового provider-а разрешен только из авторизованной user session.
- Нельзя unlink-нуть последний usable login identity.
- Unlink login identity не равен удалению email/telegram notification channel.
  `User.email` и `User.telegramId` остаются contact/runtime fields до отдельной
  notification-contact модели или явной product policy.
- Admin auth (`Admin`) не смешивать с customer identities.
- Account merge не является частью login resolver. Merge допускается только
  через admin/support flow с:
  - preflight affected assets;
  - operator identity;
  - reason;
  - transaction boundary;
  - audit log;
  - explicit conflict policy по каждому relation.
- Phase 16/17 boundaries сохраняются:
  - `ReferralLink` и `PromoCode` не объединяются;
  - partner reward ledger остается в `Transaction`;
  - owner/reward links продолжают ссылаться на canonical `User.id`.
- CloudPayments saved-card contract сохраняется:
  - token принадлежит `CloudPaymentsCardToken.userId`;
  - provider `AccountId` должен соответствовать canonical `user.id`;
  - auth linking не переносит saved cards.

## Шаги (журналы)

1. [Шаг 1. Runtime audit и identity policy lock](./phase-18/step-01-runtime-audit-and-policy-lock.md)
2. [Шаг 2. Schema, migration и identity backfill](./phase-18/step-02-schema-migration-and-backfill.md)
3. [Шаг 3. Identity resolver и login flow migration](./phase-18/step-03-identity-resolver-and-login-flows.md)
4. [Шаг 4. User-facing identities API и client UI](./phase-18/step-04-user-identities-api-and-client-ui.md)
5. [Шаг 5. Downstream ownership regression hardening](./phase-18/step-05-downstream-ownership-regression-hardening.md)
6. [Шаг 6. Admin/support duplicate preflight и merge audit](./phase-18/step-06-admin-support-merge-preflight-and-audit.md)
7. [Шаг 7. Verification, rollout и wiki sync](./phase-18/step-07-verification-rollout-and-wiki-sync.md)

## Верификация

- Existing email-login user:
  - логинится через email OTP;
  - получает тот же `user.id`;
  - видит те же заказы, баланс, referral stats и saved-card state.
- Existing Telegram user:
  - `/start` в bot не создает дубль;
  - Mini App cold start через `/auth/telegram/webapp` получает тот же `user.id`;
  - Telegram notifications продолжают уходить на корректный chat id.
- OAuth:
  - новый Google/Yandex/VK subject создает `UserIdentity`;
  - повторный вход тем же provider subject возвращает тот же `user.id`;
  - совпавший email без link не делает silent provider attach.
- Link/unlink:
  - авторизованный пользователь может привязать новый provider;
  - provider, уже принадлежащий другому `User`, возвращает conflict;
  - последняя identity не удаляется;
  - unlink не удаляет email/telegram notification target без отдельного
    явного действия.
- Ownership:
  - `Order.userId`, `Transaction.userId`, `CloudPaymentsCardToken.userId`,
    `ReferralLink.userId`, `PromoCode.referralOwnerId`,
    `PushSubscription.userId` не меняются при простом link/unlink;
  - purchase completion, partner rewards, cashback и loyalty используют
    canonical `User.id`;
  - saved-card charge продолжает отправлять `AccountId=user.id`.
- Admin/support:
  - duplicate preflight показывает affected assets до mutation;
  - merge mutation, если включена в этой фазе, пишет audit log и не запускается
    из login flow.
- Automated baseline:
  - `npx jest src/modules/auth/ --runInBand`;
  - `npx jest src/modules/users/ --runInBand`;
  - `npx jest src/modules/referrals/ --runInBand`;
  - targeted `orders.service.spec.ts`;
  - targeted `payments.service.spec.ts`;
  - `npx tsc --noEmit -p tsconfig.json` в backend;
  - `npx tsc --noEmit` в client/admin/bot при затрагивании клиента.

## Журнал

### 2026-06-06

- Phase 18 создана после чтения `docs/work/session.md`, phase authoring guide,
  architecture wiki и live runtime audit по `auth`, `users`, `orders`,
  `payments`, `referrals`, `promo-codes`, `notifications`, `client`, `admin` и
  `bot`.
- Зафиксирован policy lock: account linking нельзя начинать с UI-кнопок поверх
  `User.authProvider/providerId`; нужна отдельная identity model и migration.
- Зафиксирован запрет silent merge/link по одному email.
- Зафиксировано, что `User.id` остается владельцем business assets, а
  `UserIdentity` отвечает только за login methods.
- Создана runtime wiki страница
  [Auth Identity Runtime](../architecture/auth-identity-runtime.md).

## Ссылки

- [Корневой документ wiki](../README.md)
- [Project Phases & Roadmap](./README.md)
- [Phase Authoring Guide](./PHASE_AUTHORING_GUIDE.md)
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md)
- [System Overview](../architecture/system-overview.md)
- [Module Map](../architecture/module-map.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Promo Codes Runtime](../architecture/promo-codes-runtime.md)
