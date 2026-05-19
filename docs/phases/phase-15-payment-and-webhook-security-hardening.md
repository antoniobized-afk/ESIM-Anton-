# Phase 15: Payment & Webhook Security Hardening

> [Корневой документ wiki](../README.md)

## Цель

Закрыть security и runtime-rigor долги, вскрытые после Phase 14 и live eSIM webhook verification:

- убрать опасные double-charge / paid-but-cancelled сценарии в tokenized repeat payment;
- сузить surface хранения и выдачи чувствительных payment payloads;
- усилить degraded-auth path у eSIM Access webhook без возврата к слепым предположениям о provider contract;
- оформить reconciliation и support/runbook baseline для ambiguous payment outcomes.

## Результат

- Repeat charge по saved card становится идемпотентным и безопасным к concurrency/retry.
- Network timeout или иной ambiguous outcome больше не ведёт к немедленному `CANCELLED + fallback to widget` без reconciliation.
- `transactions.metadata` и смежные API/логирующие paths больше не тащат сырой CloudPayments payload и token дальше минимально нужной backend boundary.
- eSIM webhook fallback по `rt-accesscode` получает replay/dedup/freshness политику и ограниченный event scope.
- Wiki и runbooks фиксируют новый security baseline как source of truth.
- Для repeat-charge ambiguity появляется канонический durable state contract, а не ad-hoc markers в `errorMessage`, строковых `reason` или произвольных `metadata`.

## Оценка

- Размер фазы: `medium`
- Ожидаемое число шагов: `5`
- Основные риски:
  - сломать текущий purchase flow при ужесточении repeat-charge orchestration;
  - недооценить реальные ambiguous outcomes CloudPayments API;
  - оставить скрытый путь утечки token/raw payload через старые admin/user endpoints;
  - чрезмерно ужесточить eSIM webhook guard и снова потерять live provider callbacks.

## Зависит от

- [phase-3-admin-auth-and-api-security.md](./phase-3-admin-auth-and-api-security.md)
- [phase-10-client-payments-and-provider-hardening.md](./phase-10-client-payments-and-provider-hardening.md)
- [phase-13-esim-webhook-integration.md](./phase-13-esim-webhook-integration.md)
- [phase-14-cloudpayments-tokenized-repeat-payments.md](./phase-14-cloudpayments-tokenized-repeat-payments.md)

## Пререквизиты

- В репозитории уже существует Phase 14 saved-card contour:
  - `GET /payments/cards/active`
  - `POST /payments/charge-saved-card`
  - `CloudPaymentsCardToken`
- Реальный CloudPayments runtime уже подтвердил token capture в `Pay`.
- Реальный eSIM Access runtime уже подтвердил, что часть `ORDER_STATUS` callbacks приходит без signature trio, но с `rt-accesscode`.
- Команда согласна, что эта фаза не добавляет новых продуктовых payment features, а harden-ит существующий runtime.

## Архитектурные решения

- Payment security baseline важнее “быстрого fallback UX”: ambiguous token-charge outcome нельзя трактовать как обычный decline.
- Tokenized repeat payment не должен обходить canonical order/payment state machine, но и не должен создавать second-charge window из-за отсутствия lock/reconciliation semantics.
- Сырые provider/payment payloads не считаются нормальным источником для `metadata` и user/admin API surface; применяется safelist + redaction policy.
- eSIM webhook degraded-auth path остаётся допустимым только как runtime-compatibility seam, а не как новый preferred security contract.
- Repeat-charge idempotency должна быть cross-process и durable:
  - in-memory mutex, controller-local guard или browser-side coordination не считаются допустимым решением;
  - claim/attempt contract должен переживать retry, redeploy и параллельные backend instances.
- Ambiguous payment outcome должен выражаться через канонический persistence contract:
  - отдельное durable состояние, reconciliation marker или attempt entity;
  - `errorMessage`, свободные строковые причины и ad-hoc `metadata` не могут быть source of truth для orchestration.
- Решение по token at-rest handling в этой фазе обязательно:
  - либо шифрование/ограниченный internal read path;
  - либо явно задокументированное исключение с compensating controls;
  - формулировка “при необходимости подумаем позже” в рамках этой фазы недопустима.
- Source of truth для этой фазы:
  - код и Prisma schema;
  - `docs/architecture/payment-flow-audit.md`;
  - `docs/integrations/esim-access.md`;
  - `docs/operations/cloudpayments-runbook.md` и payment runbooks.
- Anti-overengineering guardrails:
  - фаза не строит новую payment platform, reconciliation service или webhook platform abstraction;
  - каждый новый state/model/lock/attempt contract должен оправдываться конкретным уже подтверждённым runtime failure mode;
  - если дыру можно закрыть durable contract внутри существующих `payments/*` и `esim-provider/*` модулей, отдельная подсистема не создаётся;
  - “архитектура на будущее” без прямой связи с текущими security/consistency рисками считается выходом за scope.

## Шаги (журналы)

1. [Шаг 1. Threat model и security baseline для payment/webhook контуров](./phase-15/step-01-threat-model-and-baseline.md)
2. [Шаг 2. Repeat-charge idempotency и anti-double-charge orchestration](./phase-15/step-02-repeat-charge-idempotency-and-locking.md)
3. [Шаг 3. Ambiguous outcome и reconciliation policy для token charge](./phase-15/step-03-ambiguous-outcome-and-reconciliation.md)
4. [Шаг 4. Sensitive payload minimization и token handling hardening](./phase-15/step-04-payload-minimization-and-token-handling.md)
5. [Шаг 5. eSIM webhook replay hardening, docs и verification](./phase-15/step-05-webhook-hardening-docs-and-verification.md)

## Верификация

- Параллельные или повторные вызовы `POST /payments/charge-saved-card` не могут привести к двум реальным списаниям по одному order.
- Timeout/transport error CloudPayments token charge не переводит заказ в финальный cancelled state без recovery/reconciliation policy.
- Пользовательские и admin endpoints не возвращают `Token` или иные сырые CloudPayments payloads из transaction metadata.
- Token storage и runtime use ограничены backend-only путём и не размывают trust boundary.
- Security hardening не ломает смежные payment paths:
  - обычный CloudPayments purchase widget flow;
  - eSIM top-up картой;
  - eSIM top-up с баланса;
  - balance top-up через CloudPayments;
  - legacy Robokassa paths, пока они считаются production-relevant.
- eSIM webhook degraded-auth path:
  - принимает нужные live callbacks;
  - не принимает бесконечные replay повторы без ограничений;
  - не расширяет scope неподписанных событий больше необходимого.
- Backend tests, typecheck и targeted runtime smoke проходят.

## Журнал

### 2026-05-17

- Фаза выделена как отдельный follow-up после security-аудита реализации Phase 14 и live incident вокруг eSIM webhook contract.
- Scope сознательно отделён от продуктовой фазы tokenized repeat payments: это hardening/reconciliation phase, а не новая payment feature phase.
- Реализация в repo baseline закрыла все пять шагов фазы:
  - saved-card repeat charge получил durable `repeat_charge_attempts` contract;
  - ambiguous outcome больше не уходит в `CANCELLED + widget fallback`;
  - `ChargeOrderWithSavedCardResponse` и client checkout теперь используют явный `chargeState` и `repeatChargeAttemptId`;
  - CloudPayments token хранится encrypted at rest, а transaction metadata/API surface сведены к safelist;
  - unsigned eSIM `ORDER_STATUS` path получил freshness + replay barrier через `esim_webhook_receipts`.
- После implementation audit был дополнительно закрыт ещё один runtime defect уже в обычном CloudPayments widget flow:
  - `pay` webhook теперь использует durable DB claim на переход `order -> PAID`, и только победитель claim-а имеет право запускать `fulfillOrder()` и post-payment side effects;
  - admin reconciliation pagination для `needs_attention` больше не занижает backlog через длину текущей страницы.
- **[2026-05-19]** Follow-up после audit findings:
  - пункт про double-issue race закрыт через `PAID -> PROCESSING` claim в `OrdersService.fulfillOrder()`;
  - отдельный blocking риск `provider success -> local finalize failure` теперь тоже закрыт без новой платформы:
    - issued snapshot сохраняется на `Order` до/вместо полного `COMPLETED` transition;
    - заказ остаётся в `PROCESSING` с reconciliation category `issued_but_finalize_failed` / `topup_issued_but_finalize_failed`;
    - balance purchase и balance top-up не делают refund, если provider уже выполнил side-effect, а локальная финализация упала.

## Ссылки

- [Корневой документ wiki](../README.md)
- [Project Phases & Roadmap](./README.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [CloudPayments Runbook](../operations/cloudpayments-runbook.md)
- [eSIM Access Integration](../integrations/esim-access.md)
- [Phase 14: CloudPayments Tokenized Repeat Payments](./phase-14-cloudpayments-tokenized-repeat-payments.md)
