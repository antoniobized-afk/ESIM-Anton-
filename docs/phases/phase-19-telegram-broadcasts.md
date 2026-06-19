# Phase 19: Telegram Broadcast Campaigns

> [Корневой документ wiki](../README.md)

## Цель

Добавить enterprise-grade контур Telegram-рассылок для пользователей, которые
уже взаимодействовали с ботом Mojo Mobile, без ad-hoc циклов отправки,
ручного обхода rate limits и смешивания маркетинговой подписки с login
identity.

Фаза должна дать управляемую админскую рассылку: draft, preview, audience
snapshot, очередь доставки, retry/error taxonomy, blocked/opt-out handling,
audit и прозрачный runtime status.

## Результат

- Появляется отдельный backend module `telegram-broadcasts`, который владеет
  campaign state, audience snapshot, recipient delivery rows, queue jobs и
  admin API.
- Telegram delivery получает общий низкоуровневый client/error classifier,
  который можно использовать и для broadcast worker, и для transactional
  Telegram notifications.
- Появляется `TelegramContact` как канал доставки и маркетинговая preference
  boundary. `UserIdentity(TELEGRAM)` не используется как адрес рассылки.
- Рассылка идет через BullMQ/Redis queue с консервативным free limit по
  Telegram Bot API, retry/backoff и обязательным уважением `retry_after`.
- Admin может создать draft, оценить аудиторию, отправить preview себе,
  запланировать/запустить, поставить на паузу, отменить и увидеть прогресс.
- Bot получает команды opt-out/opt-in для маркетинговых рассылок и синхронизует
  last inbound contact state через backend.
- Заблокировавшие бота, invalid targets и отписавшиеся пользователи больше не
  попадают в последующие marketing campaigns.
- Runtime wiki фиксирует final contract, ограничения Telegram и rollout
  preflight.

## Оценка

- Размер фазы: `large`
- Ожидаемое число шагов: `8`
- Основные риски:
  - получить Telegram `429` и сорвать рассылку из-за отсутствия global limiter;
  - продолжать слать пользователям, которые заблокировали бота;
  - смешать login identity (`UserIdentity`) с notification target;
  - отправить broken HTML/keyboard всей аудитории;
  - создать duplicate jobs/messages при pause/resume/retry;
  - случайно включить paid broadcast и списать Telegram Stars;
  - дать SUPPORT/MANAGER опасный destructive control без backend policy;
  - раздуть фичу в CRM-платформу вместо проверяемого broadcast contour.

## Зависит от

- [Phase 3: Admin Auth & API Security Hardening](./phase-3-admin-auth-and-api-security.md)
- [Phase 8: API Security Infrastructure](./phase-8-api-security-infrastructure.md)
- [Phase 11: Admin Panel Refactoring](./phase-11-admin-panel-refactoring.md)
- [Phase 13: eSIM Provider Webhook & Real-time Notifications](./phase-13-esim-webhook-integration.md)
- [Phase 18: Account Identity Linking & Merge](./phase-18-account-identity-linking-and-merge.md)
- [Telegram Broadcast Runtime](../architecture/telegram-broadcast-runtime.md)
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md)
- [Module Map](../architecture/module-map.md)

## Пререквизиты

- Подтвержден текущий bot registration path:
  - `bot/src/index.ts`;
  - `bot/src/api.ts`;
  - `bot/src/commands/index.ts`;
  - `backend/src/modules/users/users.controller.ts`;
  - `backend/src/modules/users/users.service.ts`;
  - `AuthIdentityResolverService.resolveTelegramBotUser()`.
- Подтверждено, что `User.telegramId` сейчас является уникальным contact field,
  а не достаточной моделью маркетинговой подписки.
- Подтверждено, что `UserIdentity(TELEGRAM)` является login identity и не
  должен становиться recipient source.
- Подтверждено, что `TelegramNotificationService` сейчас отправляет напрямую
  через `axios`, без durable retry ledger и blocked-user classification.
- Подтверждено, что `@nestjs/bullmq`, `bullmq` и `redis` уже есть в
  `backend/package.json`, но `BullModule` еще не включен в `AppModule`.
- До реализации нужно проверить production Redis/Railway env readiness через
  `.env.example` / Railway variables, не читая боевые `.env`.
- До запуска кампаний нужен продуктовый copy/policy lock:
  - это маркетинговые рассылки, не transactional eSIM/order notifications;
  - opt-out отключает marketing broadcast, но не обязан отключать сервисные
    уведомления об уже купленных eSIM;
  - paid broadcast запрещен до отдельного operator flag и budget policy.

## Архитектурные решения

- Не делать рассылку в `bot` package. Bot только регистрирует inbound contact и
  вызывает backend API для preference changes.
- Не делать cron loop по `users.telegramId`. Source of truth для кампаний:
  campaign rows + recipient rows + BullMQ jobs.
- Не расширять `UserIdentity` под notification channel. Для доставки нужен
  отдельный `TelegramContact`.
- `User.telegramId` остается compatibility field до отдельной deprecation
  работы, но Phase 19 должна backfill-ить `TelegramContact` и дальше читать
  broadcast audience из него.
- `telegram` module владеет low-level Telegram API client, formatting helpers,
  error classifier и contact-state update.
- `telegram-broadcasts` module владеет campaign aggregate, audience selection,
  queue processor, admin API и stats/read models.
- Transactional Telegram notifications не становятся marketing campaigns.
  Однако HTTP delivery и error classification должны идти через общий client,
  чтобы blocked/invalid state не расходился.
- На Phase 19 поддерживается только text + optional single inline button.
  Media/files/album campaigns не входят в первый target-state slice.
- Audience filters ограничены typed allowlist: active contacts, completed
  orders yes/no, registration date, completed order country. Arbitrary SQL/CSV
  не добавлять.
- Audience snapshot создается при schedule/start и не пересчитывается во время
  отправки.
- Queue job id должен быть deterministic: `telegram-broadcast:{campaignId}:{userId}`.
- Recipient row является идемпотентной границей. Повторный job не может
  отправить сообщение, если row уже `SENT`, `SKIPPED` или campaign отменена.
- Бесплатный rate limit по умолчанию: не выше `25 msg/sec`, чтобы оставаться
  ниже официального bulk guidance Telegram.
- `429` обрабатывается через `retry_after` и global slowdown, а не как обычный
  terminal failure.
- Paid broadcast (`allow_paid_broadcast`) не включается автоматически. Любой
  paid mode требует отдельного flag, hard cap, budget preview и audit.
- Preview обязателен перед массовой отправкой: backend должен провалить start,
  если content не был успешно отправлен admin preview или если включен explicit
  emergency override для SUPER_ADMIN.
- Role policy:
  - `SUPER_ADMIN` может создавать, запускать, отменять и включать emergency
    override;
  - `MANAGER` может создавать draft, preview и schedule/start в free mode;
  - `SUPPORT` только читает progress и error details.
- Campaign operations пишут `TelegramBroadcastAudit`.
- Bad content/HTML/keyboard errors считаются campaign-level failure и должны
  остановить кампанию до массового ущерба.

## Шаги (журналы)

1. [Шаг 1. Runtime audit и broadcast policy lock](./phase-19/step-01-runtime-audit-and-policy-lock.md)
2. [Шаг 2. Schema, TelegramContact и campaign ledger](./phase-19/step-02-schema-telegram-contact-and-campaign-ledger.md)
3. [Шаг 3. Telegram delivery client и error taxonomy](./phase-19/step-03-telegram-delivery-client-and-error-taxonomy.md)
4. [Шаг 4. BullMQ queue, limiter и worker foundation](./phase-19/step-04-bullmq-queue-limiter-and-worker-foundation.md)
5. [Шаг 5. Campaign API, audience snapshot и content validation](./phase-19/step-05-campaign-api-audience-and-content-validation.md)
6. [Шаг 6. Admin Broadcasts UI и operator controls](./phase-19/step-06-admin-broadcasts-ui-and-operator-controls.md)
7. [Шаг 7. Bot opt-out, contact sync и delivery integration](./phase-19/step-07-bot-opt-out-contact-sync-and-delivery-integration.md)
8. [Шаг 8. Verification, rollout и wiki sync](./phase-19/step-08-verification-rollout-and-wiki-sync.md)

## Верификация

- Runtime policy:
  - `UserIdentity(TELEGRAM)` не участвует в broadcast recipient selection;
  - `TelegramContact` backfill покрывает существующих пользователей с
    `User.telegramId`;
  - opt-out меняет только marketing broadcast eligibility, а не удаляет
    `User.telegramId` и не ломает login.
- Campaign lifecycle:
  - draft создается только через admin JWT;
  - preview отправляется только admin/operator target;
  - start без preview блокируется;
  - audience snapshot фиксирует recipients один раз;
  - pause/resume не создает дублей;
  - cancel останавливает pending recipients.
- Delivery:
  - worker соблюдает configured free rate limit;
  - Telegram `429 retry_after` переносит job и замедляет поток;
  - network/5xx errors retry-ятся с backoff;
  - blocked/invalid target помечает contact и исключает будущие campaigns;
  - bad HTML/content переводит campaign в `FAILED` без массовой отправки.
- Admin UI:
  - видны totals: audience, queued, sending, sent, skipped, failed;
  - detail показывает last error без raw token/payload;
  - role policy работает для SUPER_ADMIN/MANAGER/SUPPORT.
- Bot:
  - `/unsubscribe` или выбранная команда выключает marketing broadcast;
  - `/subscribe` включает обратно, если contact не `BLOCKED/INVALID`;
  - `/start` / inbound contact обновляет contact profile без дубликатов.
- Automated baseline:
  - targeted backend specs для delivery classifier, audience builder,
    campaign service, queue processor и controller guards;
  - targeted bot command tests или lightweight command handler coverage, если
    текущий bot test harness позволяет;
  - `npx tsc --noEmit -p tsconfig.json` в backend;
  - `npx tsc --noEmit` в admin и bot;
  - `pnpm --filter backend exec prisma validate`;
  - `git diff --check`.

## Ссылки

- [Корневой документ wiki](../README.md)
- [Project Phases & Roadmap](./README.md)
- [Phase Authoring Guide](./PHASE_AUTHORING_GUIDE.md)
- [Telegram Broadcast Runtime](../architecture/telegram-broadcast-runtime.md)
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md)
- [System Overview](../architecture/system-overview.md)
- [Module Map](../architecture/module-map.md)
- [Telegram Bot FAQ: Broadcasting to Users](https://core.telegram.org/bots/faq#broadcasting-to-users)
- [Telegram Bot API: sendMessage](https://core.telegram.org/bots/api#sendmessage)
