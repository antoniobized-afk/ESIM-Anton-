# CloudPayments Runbook

> [Корневой документ wiki](../README.md)

> Короткий practical runbook по настройке CloudPayments для текущего runtime.

## Нужные уведомления

Для текущей реализации нужны:

- `Check`
- `Pay`
- `Fail`

Именно под них в backend есть обработчики:

- `POST /api/payments/cloudpayments/check`
- `POST /api/payments/cloudpayments/pay`
- `POST /api/payments/cloudpayments/fail`

## Что сейчас не используется приложением

Текущий checkout runtime не зависит от:

- `Confirm`
- `Refund`
- `Receipt`
- `Cancel`
- `Recurrent`
- `SbpToken`
- `Kkt`

Это не значит, что их нельзя включить в кабинете вообще, но backend-логика покупки eSIM на них не завязана. Если включать дополнительные уведомления, нужно сначала отдельно решить, нужен ли для них code path.

## Обязательные проверки в кабинете

Перед rollout:

- сайт/терминал соответствует нужному окружению;
- test mode и production mode не перепутаны;
- URL для `Check/Pay/Fail` указывают на правильный backend domain;
- HMAC secret в CloudPayments и `CLOUDPAYMENTS_API_SECRET` совпадают;
- public id в frontend и terminal id для нужного окружения не перепутаны.

## Callback expectations

### Check

Назначение:

- проверить order existence;
- проверить amount;
- отклонить заведомо протухшую payment session.

Для expired session backend возвращает отказной код и не даёт продолжать checkout как будто он свежий.

### Pay

Назначение:

- зафиксировать успешную оплату;
- перевести order в `PAID`;
- отдать быстрый webhook ack после durable persistence payment result;
- передать заказ в асинхронный server-side fulfillment pickup;
- при Phase 14 tokenized flow дополнительно забрать `Token`, `CardFirstSix`, `CardLastFour`, `CardType`, `CardExpDate`, если они реально пришли в payload.

Late `Pay` разрешено принимать только для order, который был auto-expired по policy `Payment session expired`.

### Completion claim

Для обычного widget purchase flow `Pay`-callback не должен иметь race window на втором `fulfillOrder()`.

Текущий repo baseline:

- webhook сначала делает durable DB-claim на переход `order -> PAID`;
- только callback, который реально сделал этот transition, имеет право поставить заказ в durable pickup pool для дальнейшего fulfillment;
- scheduler worker забирает `status=PAID` и уже внутри `OrdersService.fulfillOrder()` делает CAS `PAID -> PROCESSING` перед provider call;
- повторный/параллельный `Pay` может обновить transaction audit, но не должен второй раз выдавать eSIM или повторно начислять post-payment side effects.

### User-visible runtime contract

- widget success не означает, что eSIM уже готова;
- source of truth после оплаты: `GET /orders/:id`;
- `PAID` означает: платёж принят, backend pickup ещё не завершил claim/fulfillment;
- `PROCESSING` означает: fulfillment claim-нут и выполняется либо требует reconciliation;
- `COMPLETED` означает: выдача и обязательные локальные side effects завершены.

### Fail

Назначение:

- отметить неуспешную оплату;
- release bonus hold, если он существовал.
- при tokenized checkout учитывать, что `Fail` тоже может содержать `Token`, но сам по себе fail не должен активировать карту без успешного `Pay`.

## Phase 14 Token Contract

Проверено по официальной документации CloudPayments 2026-05-17:

- для one-click/token flow CloudPayments рекомендует сохранять у себя token и маску карты после первой успешной оплаты;
- обязательное условие получения корректного токена: передавать `AccountId` в setup-платеже;
- `Pay`-уведомление может содержать:
  - `Token`;
  - `CardFirstSix`;
  - `CardLastFour`;
  - `CardType`;
  - `CardExpDate`;
  - `AccountId`;
- повторное списание выполняется сервер-сервер через API CloudPayments по токену и `AccountId`, а не повторным запуском widget.

Для текущего проекта это означает:

- `accountId` в widget flow должен оставаться стабильным и равным `user.id`;
- `email` полезен для квитанции и UX, но не считается root cause отсутствия token flow;
- локальная persistence-модель должна хранить только:
  - owner binding;
  - token;
  - card mask / brand / expiry;
  - minimal audit trail получения и деактивации;
- raw PAN/CVV хранить и логировать запрещено.
- token должен храниться в БД в зашифрованном виде:
  - preferred key source: `CLOUDPAYMENTS_TOKEN_ENCRYPTION_KEY`;
  - временный backward-compatible fallback: `CLOUDPAYMENTS_API_SECRET`, если отдельный key ещё не выдан;
  - lookup/uniqueness должны опираться на `tokenFingerprint`, а не на plaintext token.

## Phase 14 Step 01 Model Decisions

На шаге 01 зафиксировано следующее:

- в БД вводится таблица `cloudpayments_card_tokens`;
- scope модели пока CloudPayments-specific, без искусственной multi-provider абстракции;
- базовая политика этой фазы:
  - у пользователя может быть несколько исторических записей;
  - runtime этой фазы использует один актуальный active token;
  - при перевязке карты старые токены не удаляются вслепую, а деактивируются с причиной;
- минимальный audit trail:
  - `consentCapturedAt`;
  - `sourceTransactionId`;
  - `sourceInvoiceId`;
  - `deactivatedAt`;
  - `deactivationReason`;
- production-safe uniqueness:
  - глобально уникальный `cloudPaymentsToken`;
  - индексы по `(userId, isActive)` и `(accountId, isActive)` для быстрого выбора активной карты и последующей repeat-charge верификации.

Практический вывод для следующих шагов:

- `Step 02` должен не создавать новую платформу карт, а только корректно наполнять эту таблицу из `Pay`;
- `Step 03` должен строить repeat charge поверх active token и уметь деактивировать token при подтверждённой неработоспособности;
- расширение на `top-up` и `balance top-up` должно переиспользовать ту же модель, а не вводить отдельные token-хранилища.

## Phase 14 Step 03 Runtime Policy

Repo baseline после Step 03:

- repeat charge идёт через CloudPayments API `payments/tokens/charge`;
- аутентификация — HTTP Basic Auth:
  - login = `CLOUDPAYMENTS_PUBLIC_ID`
  - password = `CLOUDPAYMENTS_API_SECRET`
- idempotency:
  - backend создаёт durable `repeat_charge_attempts` запись с unique `orderId`;
  - `X-Request-ID` теперь привязан к persisted attempt key, а не к process-local состоянию;
- repeat charge включён только для purchase orders без `parentOrderId` / `topupPackageCode`.

### Fallback semantics

При token fail backend **не** пытается открыть widget на том же invoice/order.

Вместо этого:

- текущий `PENDING` order переводится в `CANCELLED`;
- pending payment transaction закрывается;
- `BONUS_SPENT` hold release-ится;
- клиент создаёт новый fresh order и только после этого уходит в обычный widget flow.

Это intentional policy, чтобы не получать:

- dangling payment sessions;
- непонятный mixed lifecycle одного invoice между token API и widget;
- неоднозначный бонусный hold state.

### Ambiguous outcome policy

Если token charge завершился transport error / timeout и backend не получил подтверждённый provider decision:

- order **не** переводится в `CANCELLED`;
- repeat-charge attempt помечается как `AMBIGUOUS`;
- `PAYMENT` transaction остаётся pending repeat-charge boundary;
- повторный `POST /payments/charge-saved-card` по тому же order не должен запускать новый charge и должен возвращать явный `chargeState` (`ambiguous` / `in_progress`);
- fresh widget fallback разрешён только после явного подтверждения decline или ручного triage.

Support/admin triage minimum:

- искать order по `orderId`;
- сверять `repeat_charge_attempts.status`, `repeatChargeAttemptId`, `cloudPaymentsTransactionId`, `providerReasonCode`, `providerMessage`;
- использовать `/orders?reconciliation=needs_attention` как основной список ambiguous repeat-charge cases;
- не инициировать новую оплату до выяснения, был ли первый charge действительно неуспешен.

## Metadata redaction baseline

CloudPayments webhook и repeat-charge runtime больше не должны сохранять в `transaction.metadata` полный provider payload.

Допустимый safelist:

- `source`, `purpose`, `status`;
- `invoiceId`, `transactionId`, `accountId`;
- `amount`, `currency`;
- `cardMask`, `cardBrand`;
- `reasonCode`, `reason`;
- `repeatChargeAttemptId`, `savedCardId`, `ambiguousReason`.

Недопустимо сохранять/возвращать через transaction API:

- `Token`;
- сырой `Data`;
- любые лишние card payload fragments, не нужные для triage.

### Token disable policy

Автодеактивация токена должна быть консервативной.

В текущем baseline token деактивируется только на reason codes, которые выглядят необратимыми для этой карты:

- `5033`
- `5036`
- `5041`
- `5043`
- `5054`
- `5062`
- `5063`

Коды типа `5051` (insufficient funds), `5091`, `5092`, `5096` не деактивируют token автоматически и должны приводить только к fallback на новую карту.

## Test Mode

Официальная документация CloudPayments разрешает использовать test cards в test mode без реального списания.

Практический минимум для smoke:

- success card;
- insufficient funds card;
- 3DS и non-3DS варианты.

Документация:

- https://developers.cloudpayments.ru/
- https://developers.cloudpayments.ru/en/

## Ограничение

CloudPayments test mode полезен для staging/manual smoke, но не заменяет unit tests и не даёт полностью детерминированного in-repo automation:

- widget живёт во внешнем iframe;
- callback delivery идёт через внешний провайдер;
- 3DS path зависит от внешнего browser/provider flow.
