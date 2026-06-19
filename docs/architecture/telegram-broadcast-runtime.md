# Telegram Broadcast Runtime

> [Корневой документ wiki](../README.md)
>
> Planned runtime contract для Phase 19. До реализации source of truth остается
> live code + Prisma schema, а этот документ фиксирует целевую границу, чтобы
> реализация не ушла в ad-hoc loop поверх Telegram Bot API.

## Scope

Документ описывает enterprise-контур админских Telegram-рассылок по
пользователям, которые уже взаимодействовали с ботом Mojo Mobile.

В scope входит:

- создание, предпросмотр, планирование, запуск, пауза и отмена broadcast campaign;
- snapshot аудитории перед отправкой;
- очередь доставки с учетом Telegram rate limits;
- классификация ошибок Telegram Bot API;
- исключение заблокировавших бота и отписавшихся от маркетинговых рассылок;
- admin visibility по прогрессу, ошибкам и итогам.

В scope Phase 19 не входит:

- произвольный CRM-сегментатор с динамическим SQL-конструктором;
- media-heavy campaigns, albums, stickers и файлы как обязательный V1;
- платные broadcast limits без явного operator flag и budget policy;
- перенос transactional eSIM/order/traffic notifications в отдельный marketing flow;
- отправка в группы и каналы.

## Current Runtime Audit

Текущий bot runtime:

- `bot` работает на `grammy`;
- при входящем update вызывает backend `POST /api/users/find-or-create`;
- backend сохраняет пользователя через `UsersService.findOrCreate()` и
  `AuthIdentityResolverService.resolveTelegramBotUser()`;
- `User.telegramId` в Prisma сейчас является уникальным contact/runtime field;
- `UserIdentity(TELEGRAM)` является login identity, а не каналом доставки.

Текущий Telegram delivery runtime:

- `backend/src/modules/telegram/telegram-notification.service.ts` отправляет
  сообщения напрямую через `axios` в Telegram Bot API;
- сервисные уведомления вызываются из orders, payments, provider webhook и
  traffic monitor paths;
- durable attempt ledger, campaign state, retry taxonomy и blocked-user state
  отсутствуют;
- `TrafficMonitorService` уже содержит полезный локальный паттерн: группировка
  сообщений по `telegramId`, cooldown и throttling, но это не broadcast queue.

Текущая инфраструктура:

- `@nestjs/bullmq`, `bullmq` и `redis` уже есть в `backend/package.json`;
- `BullModule` пока не зарегистрирован в `AppModule`;
- `ScheduleModule` уже используется для cron jobs;
- Redis заявлен в инфраструктуре, но основные runtime flow пока на него не
  завязаны.

## External Telegram Constraints

Официальные Telegram constraints, которые должна уважать реализация:

- в одном private chat нельзя устойчиво отправлять больше одного сообщения в
  секунду;
- bulk notifications без paid broadcast нельзя вести быстрее примерно 30
  пользователей в секунду;
- при превышении limits Telegram возвращает `429` и `retry_after`;
- `sendMessage.text` ограничен 1-4096 символами после entity parsing;
- `allow_paid_broadcast=true` может поднять broadcast limit до 1000 сообщений в
  секунду за Telegram Stars, но это платный режим и он не должен включаться по
  умолчанию.

Target default для Phase 19: бесплатный режим с консервативным лимитом
`25 сообщений/сек` и обязательным уважением `retry_after`.

## Target Ownership

### `telegram`

`backend/src/modules/telegram` владеет низкоуровневым Telegram API client:

- нормализация payload для `sendMessage` и будущих Telegram send methods;
- HTML escaping/helpers;
- классификация ошибок;
- обновление состояния Telegram contact после terminal delivery errors.

`TelegramNotificationService` остается сервисом композиции transactional
сообщений, но его HTTP-вызовы должны идти через общий delivery client.

### `telegram-broadcasts`

Новый backend module `backend/src/modules/telegram-broadcasts` владеет:

- campaign aggregate;
- audience snapshot;
- recipient delivery rows;
- BullMQ queue и processor для broadcast jobs;
- admin API для draft/preview/schedule/start/pause/cancel/retry;
- read models для dashboard/progress/error details.

### `bot`

`bot` остается клиентом над backend API:

- регистрирует первый контакт;
- вызывает backend для opt-out / opt-in команд;
- не хранит campaign state;
- не делает broadcast loop.

### `admin`

`admin` дает operator surface:

- draft editor;
- audience estimate;
- preview send to admin;
- schedule/start/pause/cancel controls;
- progress and error visibility.

Admin UI не является source of truth для state transitions. Все transitions
валидирует backend.

## Target Data Model

### `TelegramContact`

Отдельный contact record нужен, чтобы не смешивать login identity,
маркетинговое согласие и техническую доставляемость.

Предлагаемый минимум:

- `id`;
- `userId`;
- `telegramId`;
- `status`: `ACTIVE | BLOCKED | INVALID`;
- `marketingStatus`: `ENABLED | OPTED_OUT`;
- `username?`, `firstName?`, `lastName?`, `languageCode?`;
- `lastInboundAt?`;
- `lastDeliveredAt?`;
- `blockedAt?`;
- `lastErrorCode?`;
- `lastErrorDescription?`;
- `createdAt`, `updatedAt`;
- unique indexes по `userId` и `telegramId`.

`User.telegramId` остается compatibility/contact field до отдельной
deprecation-фазы, но broadcast eligibility должна идти через
`TelegramContact`.

### `TelegramBroadcastCampaign`

Campaign хранит operator-owned snapshot:

- `id`;
- `status`: `DRAFT | SCHEDULED | ENQUEUING | SENDING | PAUSED | CANCELLED | COMPLETED | FAILED`;
- `title`;
- `messageText`;
- `parseMode`: на Phase 19 только `HTML`;
- `buttonText?`;
- `buttonUrl?` или `buttonWebAppPath?`;
- `audienceFilter` как JSON snapshot разрешенных фильтров;
- `audienceSizeSnapshot`;
- `scheduledAt?`, `startedAt?`, `completedAt?`;
- `createdByAdminId`, `updatedByAdminId?`, `startedByAdminId?`;
- `rateLimitPerSecondSnapshot`;
- `paidBroadcastEnabledSnapshot`;
- `createdAt`, `updatedAt`.

### `TelegramBroadcastRecipient`

Recipient row является idempotency boundary для доставки:

- `campaignId`;
- `userId`;
- `telegramContactId`;
- `telegramIdSnapshot`;
- `status`: `PENDING | QUEUED | SENDING | SENT | SKIPPED | FAILED`;
- `skipReason?`;
- `attempts`;
- `nextAttemptAt?`;
- `lastAttemptAt?`;
- `sentAt?`;
- `telegramMessageId?`;
- `lastErrorCode?`;
- `lastErrorDescription?`;
- unique `(campaignId, userId)`.

### `TelegramBroadcastAudit`

Audit фиксирует operator actions:

- `CREATED`;
- `UPDATED`;
- `PREVIEW_SENT`;
- `SCHEDULED`;
- `STARTED`;
- `PAUSED`;
- `RESUMED`;
- `CANCELLED`;
- `FAILED`;
- `COMPLETED`;
- `RETRY_REQUESTED`.

Per-recipient attempts не нужно превращать в отдельный event stream в Phase 19:
текущий статус и последние error fields достаточны для support visibility.

## Delivery Semantics

1. Campaign нельзя отправить без successful preview или явного backend flag
   `skipPreview=false` по умолчанию.
2. При старте audience фиксируется snapshot rows в
   `TelegramBroadcastRecipient`.
3. Каждый recipient получает idempotent queue job с ключом
   `campaignId:userId`.
4. Worker перед отправкой перечитывает campaign и recipient:
   - paused/cancelled campaign не отправляется;
   - contact уже `BLOCKED`, `INVALID` или `OPTED_OUT` получает `SKIPPED`;
   - уже `SENT` не отправляется повторно.
5. Успешный Telegram response пишет `SENT`, `sentAt`, `telegramMessageId` и
   `TelegramContact.lastDeliveredAt`.
6. `429` не считается обычной ошибкой recipient-а:
   - worker уважает `retry_after`;
   - job возвращается в ожидание без агрессивного роста attempts;
   - глобальный send rate временно замедляется.
7. Network/5xx errors retry-ятся с backoff и ограничением attempts.
8. Terminal errors (`403 blocked`, invalid chat, deactivated target) переводят
   recipient в `FAILED` или `SKIPPED`, а contact получает terminal status.
9. Bad content errors должны останавливать campaign, а не сжигать всю аудиторию
   одинаковыми terminal recipient failures.

## Error Taxonomy

Минимальная классификация:

- `RATE_LIMITED`: Telegram `429`, использовать `retry_after`;
- `BLOCKED`: пользователь заблокировал бота или чат недоступен для бота,
  terminal для marketing и transactional delivery до нового inbound contact;
- `INVALID_TARGET`: неверный или устаревший chat id, terminal;
- `BAD_REQUEST_CONTENT`: ошибка текста, entities, keyboard или payload,
  campaign-level failure;
- `AUTH_CONFIGURATION`: неверный bot token / missing token, system-level
  failure;
- `TRANSIENT_NETWORK`: timeout, DNS, connection reset, retryable;
- `TELEGRAM_5XX`: retryable with backoff;
- `UNKNOWN`: retryable ограниченное число раз, затем failed for support triage.

## Audience Contract

Phase 19 поддерживает только типизированные фильтры:

- все active Telegram contacts;
- только пользователи с completed primary orders;
- только пользователи без completed orders;
- дата регистрации пользователя;
- страна последнего или любого completed order;
- исключить blocked/invalid/opted-out всегда.

Произвольный SQL, загрузка CSV и ad-hoc targeting не входят в Phase 19.

## Content Contract

Phase 19 content:

- text message;
- `HTML` parse mode;
- optional one-button inline keyboard:
  - URL button;
  - или WebApp button на allowlisted `MINI_APP_URL` path.

Media/files можно добавить позже через расширение payload contract, но первый
этап не должен блокироваться на storage, preview assets и moderation media
pipeline.

## Paid Broadcast Policy

`allow_paid_broadcast` в Telegram Bot API не включается автоматически.

Для включения платного режима нужна отдельная operator policy:

- явный campaign flag;
- system setting `telegram_broadcast_paid_enabled=true`;
- hard limit на максимальное число paid recipients;
- расчет max Stars exposure до старта;
- audit записи кто включил режим;
- отдельный smoke на BotFather/balance prerequisites.

До такой policy target runtime всегда использует free mode.

## Verification Baseline

Phase 19 считается закрытой только если подтверждены сценарии:

- draft -> preview -> schedule/start -> sending -> completed;
- pause/resume не создает duplicate messages;
- cancel останавливает pending recipients;
- blocked user получает contact status `BLOCKED` и исключается из следующей
  campaign;
- opt-out пользователь не попадает в marketing broadcast, но transactional
  notification policy остается отдельной;
- `429 retry_after` переносит jobs и не валит campaign;
- bad HTML/content останавливает campaign до массовой отправки;
- admin видит totals: audience, queued, sent, skipped, failed, rate-limited;
- backend/admin/bot type-check и targeted tests проходят.

## Links

- [Phase 19: Telegram Broadcast Campaigns](../phases/phase-19-telegram-broadcasts.md)
- [Auth Identity Runtime](./auth-identity-runtime.md)
- [Module Map](./module-map.md)
- [System Overview](./system-overview.md)
- [Telegram Bot FAQ: Broadcasting to Users](https://core.telegram.org/bots/faq#broadcasting-to-users)
- [Telegram Bot API: sendMessage](https://core.telegram.org/bots/api#sendmessage)
