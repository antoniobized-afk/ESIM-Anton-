# eSIM Access Integration

> [Корневой документ wiki](../README.md)

## Статус

Интеграция с eSIM Access присутствует в коде и является фактическим primary provider path в `backend/src/modules/esim-provider/esim-provider.service.ts`.

Актуальная архитектурная сводка:

- [../architecture/system-overview.md](../architecture/system-overview.md)
- [../architecture/runtime-and-operations.md](../architecture/runtime-and-operations.md)
- [../architecture/legacy-doc-audit.md](../architecture/legacy-doc-audit.md)

## Что важно

- этот файл больше не хранит реальные credentials;
- любые access codes, secret keys, логины и пароли должны жить только в локальном `.env` или в secrets manager;
- попадание реальных доступов в git нужно считать security incident.

## Переменные окружения

Используются следующие env keys:

```env
ESIMACCESS_ACCESS_CODE=
ESIMACCESS_SECRET_KEY=
```

Legacy compatibility keys, которые тоже читаются сервисом:

```env
ESIM_PRIMARY_API_URL=https://api.esimgo.com/v2
ESIM_PRIMARY_API_KEY=
ESIM_FALLBACK_API_URL=
ESIM_FALLBACK_API_KEY=
```

## Подтвержденные возможности по коду

- получение списка пакетов;
- покупка eSIM;
- получение информации по заказу;
- получение usage/status snapshot по ICCID;
- top-up пакетов и пополнение eSIM;
- health check.

## Usage/status contract

- для usage/status по ICCID код теперь сначала использует `POST /api/v1/open/esim/list` (`Query All Allocated Profiles`) с `iccid + pager`, потому что именно этот endpoint у eSIM Access возвращает `esimList[]` c `totalVolume`, usage/status и сроком;
- если `/esim/list` вернул пусто или ошибку, включается fallback на `POST /api/v1/open/esim/query`, чтобы не ломать старые заказы/вариации API;
- нормализация статусов расширена под реальные коды eSIM Access: `Provisioning`, `New`, `Available`, `Downloaded`, `Onboard`, `In Use`, `Suspended`, `UsedUp`, `Disabled` и legacy-коды вроде `GOT_RESOURCE`, `RELEASED`, `INSTALLATION`.

## Webhook contract

- provider webhook endpoint: `POST /api/esim-provider/webhook`;
- preferred auth path: `RT-Signature` + `RT-Timestamp` + `RT-RequestID`, HMAC-SHA256 over `timestamp + requestId + accessCode + rawBody`;
- confirmed live-runtime fallback: часть `ORDER_STATUS` callbacks приходит без signature trio, но с `rt-accesscode`; текущий guard принимает их только если:
  - `rt-accesscode === ESIMACCESS_ACCESS_CODE`;
  - `notifyType === ORDER_STATUS`;
  - `eventGenerateTime` валиден и укладывается в freshness window (`ESIM_WEBHOOK_UNSIGNED_MAX_AGE_MS`, `ESIM_WEBHOOK_UNSIGNED_FUTURE_SKEW_MS`);
  - событие ещё не встречалось в `esim_webhook_receipts`;
- `CHECK_HEALTH` provider still sends unsigned by design;
- `ORDER_STATUS` нужен не только как лог: статус `GOT_RESOURCE` используется для дообогащения локального заказа по `providerOrderId` или provider `transactionId`. Purchase flow передаёт в provider `transactionId = Order.id`, чтобы callback можно было связать с локальным заказом даже до сохранения `providerOrderId`.
- если provider query вернул QR или activation/LPA, локальный `PROCESSING` заказ с successful `PAYMENT` может быть дофинализирован через canonical `OrdersService` без повторного `purchaseEsim()`;
- после такой дофинализации purchase order становится `COMPLETED`, а cashback/referral/partner accounting запускается отдельно через `completionAccountingStatus`; ошибка accounting не блокирует eSIM и не требует повторной покупки у провайдера;
- admin Telegram notification по `ORDER_STATUS` должен показывать не только сырой `orderStatus`, но и локальные поля `localAction`, `localOrderId`, `localFinalStatus`, `localReconciliation`;
- retry policy: если enrichment или auto-finalize по `ORDER_STATUS/GOT_RESOURCE` падает на provider query/runtime error, backend не подтверждает событие окончательно и освобождает replay receipt, чтобы повторная доставка webhook не была потеряна.

## Маркеры пакетов и HK-роутинг

eSIM Access роутит трафик дешёвых пакетов **любых стран** (не только Китая) через гонконгский узел (breakout country = Hong Kong). Это дешевле для провайдера, но у пользователя:

- IP-адрес **гонконгский**, а не страны назначения;
- **TikTok, Facebook и другие сервисы могут блокироваться** по гонконгским гео-ограничениям;
- некоторые локальные приложения и банковские сервисы могут работать некорректно.

Пакеты с маркером `nonhkip` (Non-Hong Kong IP) — **дороже**, потому что трафик идёт напрямую через сеть страны назначения → пользователь получает IP страны, нет блокировок.

### Маркеры в именах пакетов

| Маркер в `pkg.name` / `pkg.slug` | Значение |
|---|---|
| `(nonhkip)`, `non-hk`, `non hk` | Трафик НЕ через Гонконг → IP страны назначения |
| `no hong kong`, `excluding hk`, `exclude hk` | То же самое (формулировка для Китая) |
| `mainland` | Материковая сеть (обычно Китай) |
| `via hk`, `hk ip`, `hong kong ip`, `via hong kong` | Трафик **через Гонконг** → HK IP |

### Автоматические теги (inferTagsFromPackage)

При синхронизации (`POST /api/products/sync`) бэкенд автоматически проставляет теги по маркерам в имени пакета:

| Тег | Когда ставится |
|---|---|
| **Не гонконгский IP** | Любая страна + маркер `nonhkip`/`non-hk`/`mainland`/etc. |
| **Материковый Китай** | Только Китай + маркер `nonhkip`/`mainland`/etc. |
| **Гонконгский IP** | Любая страна + маркер `via hk`/`hk ip`/etc. |
| **5G**, **4G/LTE** | По маркерам скорости в имени |
| **Дневной лимит** | `/day`, `daily`, `day pass` в имени |
| **Раздача Wi-Fi** | `hotspot`, `tethering` в имени |
| **Голосовые звонки**, **SMS** | `voice`/`call`, `sms` в имени |
| **Мульти-страна** | `regional`, `multi-country` в имени |

Логика: `ProductsService.inferTagsFromPackage()` ([products.service.ts](../../../backend/src/modules/products/products.service.ts)).

Для существующих продуктов синхронизация **не затирает** теги, если они были отредактированы вручную через админку (массив `tags` не пустой).

## Ограничения

- `syncProducts()` в текущем сервисе не пишет данные в БД, а только получает пакеты и возвращает счётчик;
- coexistence с legacy eSIM Go кодом всё ещё создаёт двусмысленность в операционной модели;
- без валидных credentials provider endpoints будут недоступны.

## Следующий шаг

Отдельной задачей нужно:

1. проверить реальный provider flow в runtime;
2. решить, что остаётся как fallback, а что можно удалить;
3. задокументировать production-safe процесс ротации secrets.
