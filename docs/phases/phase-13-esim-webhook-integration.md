# Phase 13: eSIM Provider Webhook & Real-time Notifications

**Статус:** Выполнено (✅)

Эта фаза посвящена отказу от legacy-подхода pull-мониторинга трафика (периодические запросы по крону) и переходу на push-модель (webhooks от провайдера) для обеспечения моментальных уведомлений пользователям и актуального состояния базы данных.

## 1. Проблема (Pull-модель)

До внедрения webhooks, обновление статусов eSIM и проверка остатка трафика работали исключительно по крону:
- **Задержки:** Данные в API провайдера (через pull-опросы) обновлялись с задержкой от 1 до 3 часов, к тому же крон запускался только раз в час. Итоговая задержка уведомления могла достигать нескольких часов.
- **Ложные срабатывания:** Существовал жестко зашитый лимит `LOW_REMAINING_MB` = 100 МБ. При покупке небольшого пакета (например, 100 МБ), остаток в 100 МБ классифицировался как "заканчивающийся", и пользователь получал ложное уведомление о низком трафике сразу же после активации пакета.
- **Отсутствие предупреждений об истечении:** Система не отслеживала и не предупреждала пользователя о том, что срок действия eSIM (Validity) подходит к концу.

## 2. Архитектура решения (Push-модель)

Был реализован защищенный endpoint для приема событий от провайдера `eSIM Access`.

### Webhook Endpoint & Payload
Провайдер шлет POST-запросы на `/api/esim-provider/webhook`.
Разработана строгая типизация входящих событий (`EsimWebhookPayload`), покрывающая:
- `CHECK_HEALTH` — валидационный запрос провайдера при сохранении URL.
- `DATA_USAGE` — уведомления о порогах расхода трафика.
- `VALIDITY_USAGE` — уведомления об истечении срока действия.
- `ESIM_STATUS` — смена статуса eSIM (например, `IN_USE`, `CANCELLED`).
- `ORDER_STATUS` — обновление статуса заказа на стороне провайдера.

### Безопасность (Security Hardening)
Endpoint защищен классом `EsimWebhookGuard`, который:
1. **Верифицирует HMAC-SHA256 подпись:**
   Вычисляет подпись на основе `RT-Timestamp`, `RT-RequestID`, `RT-AccessCode` и `rawBody` запроса, сравнивая с переданной в заголовке `RT-Signature`.
2. **Защита от Timing Attacks:**
   Используется `crypto.timingSafeEqual` для сравнения подписей.
3. **Деградированный live-runtime fallback:**
   В реальном рантайме был зафиксирован `ORDER_STATUS` webhook от eSIM Access, который приходил без `RT-Signature`, `RT-Timestamp`, `RT-RequestID`, но с валидным `rt-accesscode`. Текущий Guard принимает такой запрос в degraded-auth режиме только если `rt-accesscode` совпадает с `ESIMACCESS_ACCESS_CODE`, `notifyType === ORDER_STATUS`, `eventGenerateTime` свежий и dedup key ещё не занят в `esim_webhook_receipts`.
4. **Безопасная обработка Health Check:**
   `CHECK_HEALTH` по-прежнему пропускается без подписи для валидации URL на стороне провайдера. Неподписанные запросы без `CHECK_HEALTH` и без валидного `rt-accesscode` отклоняются с `401 Unauthorized`.

## 3. Бизнес-логика и Уведомления

В `EsimWebhookService` реализована обработка всех типов событий:
- **Умные уведомления по трафику:** Вместо абсолютных значений используется процентное соотношение. Добавлена градации: "Использовано 80%" (мягкое предупреждение) и "Трафик исчерпан" (100%).
- **Дедупликация (Cooldown):** Чтобы не спамить пользователя, в `Order` добавлены поля `lowTrafficNotifiedAt` и `expiryNotifiedAt`. Уведомления о малом трафике и скором истечении не отправляются чаще, чем раз в 24 часа.
- **ORDER_STATUS enrichment + finalize recovery:** событие `ORDER_STATUS` со статусом `GOT_RESOURCE` теперь используется не только как лог. Webhook ищет локальный `Order` по `providerOrderId` или provider `transactionId`, дообогащает его через provider query и, если локально есть `PROCESSING + successful PAYMENT + QR/LPA snapshot`, дофинализирует заказ через canonical `OrdersService` без повторной покупки у провайдера.
- **Admin webhook visibility:** Telegram-уведомление администратору по `ORDER_STATUS` должно содержать не только сырой provider `orderStatus`, но и смысл статуса, `transactionId`, локальный `orderId`, `localAction`, итоговый локальный статус и reconciliation category.
- **Гибридный подход (Fallback):** Существующие Cron-задачи были переписаны и оставлены в качестве "сети безопасности" (safety net) на случай недоставки webhook-а. Cron `monitorExpiringEsims` проверяет eSIM, у которых срок действия истекает менее чем через 24 часа, и отправляет уведомление.

## 4. Затронутые файлы и структура БД

- **DB Schema:** В модель `Order` добавлены `lastUsageBytes`, `lastUsageTotalBytes`, `lastUsageAt`, `lowTrafficNotifiedAt`, `expiryNotifiedAt`, `esimStatus`.
- **EsimProviderModule:** Регистрация контроллера, сервиса и Guard-а.
- **TrafficMonitorService:** Убран legacy-код `LOW_REMAINING_MB`, добавлен cron для проверки Validity.

## 5. Runtime caveat

Live runtime eSIM Access оказался менее строгим, чем предполагала исходная фаза:

- подпись `RT-Signature` не гарантирована для каждого `ORDER_STATUS`;
- `rt-accesscode` реально приходит и может быть единственным auth-сигналом;
- `ORDER_STATUS` не всегда содержит `iccid`, поэтому нельзя отбрасывать событие только из-за отсутствия ICCID.

Это поведение уже учтено в текущем коде и должно считаться source of truth вместо старого предположения "все не-health webhooks обязательно подписаны".

Дополнительный hardening baseline после Phase 15:

- unsigned fallback ограничен только `ORDER_STATUS`, а не любыми notifyType;
- для unsigned path действует freshness window;
- duplicate/replay unsigned callback отклоняется через durable receipt barrier;
- если enrichment или auto-finalize по `ORDER_STATUS/GOT_RESOURCE` падает, webhook не считается окончательно обработанным и остаётся retryable;
- purchase flow передаёт локальный `order.id` в eSIM Access `transactionId`, чтобы webhook мог найти заказ даже до сохранения `providerOrderId`.
- `ORDER_STATUS/GOT_RESOURCE` и admin `Дофинализировать` используют одну короткую completion boundary; purchase accounting запускается после completion отдельно и при ошибке уходит в `completion_accounting_failed`/retry без повторного provider purchase.

## 6. Итог

Переход на Webhooks значительно снизил нагрузку на API провайдера (отсутствие поллинга сотен eSIM каждый час), обеспечил моментальную доставку сервисных сообщений в Telegram бота и повысил общую надежность системы уведомлений. Внедренная HMAC-авторизация исключает возможность спуфинга событий.
