# eSIM Access Integration

> [Корневой документ wiki](../README.md)

## Статус

Интеграция с eSIM Access присутствует в коде и является фактическим primary provider path в `backend/src/modules/esim-provider/esim-provider.service.ts`.

Актуальная архитектурная сводка:

- [../architecture/system-overview.md](../architecture/system-overview.md)
- [../architecture/module-map.md](../architecture/module-map.md)

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

## Package `dataType` taxonomy

Каноническая taxonomy берётся из eSIM Access `Package List` API. Локальный owner — `shared/product-data-type.ts`; backend sync, admin filters/table/modal и docs должны брать подписи только оттуда.

| `dataType` | Provider label | Русская подпись |
|---:|---|---|
| `1` | `Data in Total` | `Пакет данных на весь срок` |
| `2` | `Daily Limit (Speed Reduced)` | `Дневной лимит (снижение скорости)` |
| `3` | `Daily Limit (Service Cut-off)` | `Дневной лимит (отключение услуги)` |
| `4` | `Daily Unlimited` | `Дневной безлимит` |

Важно: `dataType=2` не равен `Daily Unlimited`; это дневной лимит, после которого скорость снижается. `Daily Unlimited` — отдельный provider type `4`.

Sync contract:

- catalog sync запускает независимые `Package List` запросы для `dataType=1..4` параллельно через `Promise.allSettled`, а не последовательно. У каждого provider type сохраняется отдельный success/warn log; ошибка одного type не блокирует обработку пакетов, полученных по другим types. Такой sync возвращается как partial result: `errors` включает provider batch failures, `providerErrors/providerFailures` раскрывают незагруженные `dataType`, а admin показывает не зелёный success, а предупреждение об ошибках.
- `dataType=2` хранится как дневной лимит со снижением скорости: `speed` заполняется только из provider/name (`speed`, `fupPolicy`, `FUP...`), без выдуманного fallback.
- `dataType=3` хранится как дневной лимит с отключением услуги: `speed` остаётся пустым, описание говорит об отключении до следующего дневного периода.
- `dataType=4` хранится как дневной безлимит: `dataAmount = "Безлимит"`, `speed` пустой, описание не содержит текста про дневной лимит или снижение скорости.
- Для existing products sync сохраняет ручную `ourPrice`, пока не меняется pricing-семантика `daily` ↔ `standard`. Если provider-ответ меняет `dataType/isUnlimited` так, что цена больше не означает тот же период, backend repair-ит `ourPrice` через текущие pricing settings (`providerPrice`, курс, markup) и пишет warning в sync log. Это закрывает legacy daily `dataType=null` -> `dataType=1` без продажи многодневного standard-пакета по старой дневной цене.

Admin write contract:

- create/edit form показывает явный выбор `dataType` из shared taxonomy `1..4`; write DTO принимает только эти numeric codes или их строковые form/query значения, без boolean/object coercion;
- ручное создание продукта стартует с `dataType=1`, но админ может выбрать любой точный provider type до сохранения;
- legacy daily с `dataType=null` показывается как неопределённый подтип и при сохранении без выбора не отправляет `dataType`, чтобы не сбросить unknown в standard;
- admin не отправляет `isUnlimited` как write-owner: backend пересчитывает legacy boolean из выбранного `dataType`.
- product list filters используют `dataType` как read-owner: точные фильтры отправляют `1..4`, aggregate "все дневные типы" отправляет `dataType=daily`, backend маппит его в `dataType in (2,3,4)`. Legacy query `tariffType=standard|unlimited` остаётся только input adapter и тоже маппится на `dataType=1` / `dataType in (2,3,4)`, а не на persisted `isUnlimited`.
- bulk toggle по типу использует тот же `dataType` selector как destructive write boundary: body принимает только `dataType=1|2|3|4|daily` и `isActive`, aggregate `daily` маппится в `dataType in (2,3,4)`, точные daily subtypes обновляются отдельно, а legacy `tariffType`/boolean/object inputs не являются допустимыми body-полями.

Client display contract:

- user-facing `client` получает `Product.dataType` как provider taxonomy `1..4`; `null` допустим только для legacy daily-строк, где старый `isUnlimited=true` не позволяет доказать точный provider subtype;
- `/country/[country]` группирует тарифы как `dataType=1` vs дневные `dataType=2..4`; legacy URL `tab=unlimited` принимается только как alias для дневной вкладки, но UI не называет все дневные тарифы безлимитными;
- `/product/[id]` строит подписи тарифа, строку трафика и поведение после лимита по `dataType`: `2` — снижение скорости, `3` — отключение доступа до следующего дня, `4` — дневной безлимит без текста про дневной лимит/speed fallback;
- `isUnlimited` остаётся производным legacy boolean для pricing/orders period flow и не является owner-ом пользовательской taxonomy.
- legacy daily с `dataType=null` должен оставаться дневным тарифом по `isUnlimited=true`, но UI не должен выдавать его за provider type `2`, `3` или `4`; точный subtype исправляется через verified provider sync или ручную admin-классификацию.
- rolling deploy skew: если новый `client` временно получает ответ старого backend без `dataType` или с невалидным `dataType`, он использует `isUnlimited=true` только как read-fallback "legacy daily unknown", сохраняет выбор дней/`periodNum` и не выводит provider subtype `2/3/4`.

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
