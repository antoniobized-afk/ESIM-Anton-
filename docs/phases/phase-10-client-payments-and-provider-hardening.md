# Phase 10: Client Runtime, Payments & Provider Hardening

> [Корневой документ wiki](../README.md)

## Цель

Закрыть подтверждённые HIGH и MEDIUM риски из аудита `docs/audits/audit.md`, которые лежат на стыке `client`, `payments`, `orders` и `esim-provider`, не ломая текущий production runtime Telegram Mini App / PWA / card payment / provider issuance.

Фаза должна не "переписать клиент на SSR" и не "вырезать legacy", а последовательно стабилизировать:

- client startup orchestration и hydration-sensitive участки;
- payment/provider partial-failure visibility и reconciliation path;
- provider/payment logging surface;
- подтверждённый UI regression на `order/[id]`;
- documentation/runbook слой вокруг coexistence CloudPayments, Robokassa и eSIM Access.

## Результат

- `client` сохраняет текущую Telegram/PWA совместимость, но startup sequence между `TelegramSdkScript`, `AuthProvider` и `TelegramRedirectHandler` становится детерминированнее и меньше зависит от фиксированных таймеров.
- Hydration-sensitive маршруты описаны и приведены к согласованному pattern там, где используется `useSearchParams()` и browser-only boot logic.
- Подтверждённый UI bug на `client/app/order/[id]/page.tsx` устранён без широкого редизайна остального клиента.
- Логирование в payment/provider цепочке сокращено до production-safe baseline: без full raw payload/response по умолчанию.
- Для сценария "оплата успешна, а выдача eSIM/топап не завершились" зафиксирован и частично реализован минимальный reconciliation/alerting path, не меняющий основную state machine вслепую.
- Wiki и phase-docs явно описывают, что является intentional tradeoff, что является bug, а что является legacy-but-active compatibility path.

## Оценка

~1-2 рабочих дня на реализацию и проверку, если разбивать работы на отдельные безопасные волны.

Риск регрессий средний и местами высокий:

- client startup changes могут сломать Telegram-first UX;
- payment/provider changes могут затронуть реальные оплаченные заказы;
- logging changes могут скрыть полезный debug-контекст, если сделать их слишком агрессивно.

Поэтому фаза должна выполняться волнами, а не одним большим PR.

## Зависит от

- [phase-3-admin-auth-and-api-security.md](./phase-3-admin-auth-and-api-security.md) — ownership/access control уже должны быть в baseline.
- [phase-4-loyalty-and-referral-wiring.md](./phase-4-loyalty-and-referral-wiring.md) — completion boundary уже сведена к `OrdersService.fulfillOrder()`.
- [phase-5-esim-usage-status-and-activation.md](./phase-5-esim-usage-status-and-activation.md) — provider usage/status contract и activation boundary уже описаны.
- [phase-8-api-security-infrastructure.md](./phase-8-api-security-infrastructure.md) — CORS, headers и DTO hardening идут рядом и не должны конфликтовать с этой фазой.

## Пререквизиты

- Прочитан и актуален [docs/audits/audit.md](../audits/audit.md).
- Подтверждены реальные runtime-потоки для `client`, `backend`, Telegram Mini App и payment webhooks.
- Локально поднимаются как минимум `backend` и `client`.
- Есть способ воспроизвести базовые сценарии:
  - cold start Mini App;
  - логин/восстановление auth;
  - покупка eSIM картой;
  - покупка с баланса;
  - пополнение баланса;
  - открытие `order/[id]`.
- Команда согласна, что Phase 10 не является миграцией на RSC/SSR и не является задачей по удалению Robokassa.

## Архитектурные решения

- Phase 10 не переводит клиент массово в Server Components. Текущий `client/lib/api.ts` и auth/storage model привязаны к browser runtime, поэтому SSR/RSC migration рассматривается как отдельная крупная фаза, а не как побочный эффект этой.
- Глобальный `suppressHydrationWarning` нельзя просто удалить. Сначала нужно локализовать реальные mismatch-источники и только потом сужать его область.
- Cached auth restore в `AuthProvider` рассматривается как intentional tradeoff для быстрого старта, а не как bug. Phase 10 должна уменьшать race conditions, не убивая instant restore UX.
- CloudPayments остаётся основным modern card flow. Robokassa остаётся legacy-but-active compatibility path, пока бизнес явно не подтвердит возможность удаления.
- Внешние provider calls (`purchaseEsim`, `topupEsim`, usage snapshot) остаются вне долгих DB transactions. Консистентность достигается через compensation/reconciliation, а не через оборачивание внешнего API в локальную транзакцию.
- Логирование должно быть downgraded до production-safe baseline: masking/default redaction, а полный raw debug возможен только через явный debug flag или targeted troubleshooting mode.
- Рекомендации этой фазы должны быть минимально инвазивными. Никакого "попутного" рефакторинга всего клиента, глобального redesign order pages или переизобретения payment state machine.

## Порядок реализации

### Wave 1. Client startup и hydration discipline

- Зафиксировать deterministic signal окончания auth/bootstrap вместо fixed timeout coordination.
- Выделить и стандартизировать hydration-sensitive маршруты, где используются `useSearchParams()` и browser-only initial state.
- Исправить `order/[id]` на текущий design system без масштабного refactor соседних страниц.

### Wave 2. Logging и operational safety

- Убрать full payload logging из `EsimAccessProvider` и Robokassa/related payment surfaces.
- Ввести safe logging conventions для ICCID, paymentId, order identifiers и provider responses.
- Обновить wiki/runbook, чтобы troubleshooting после этого не зависел от raw production logs.

### Wave 3. Payment/provider reconciliation

- Явно зафиксировать сценарии paid-but-not-fulfilled и topup-paid-but-failed.
- Добавить минимальный detection/alerting/retry baseline без переделки всей state machine.
- Подготовить operational verification path для реальных инцидентов.

## Ожидаемые зоны регрессии

- Telegram SDK может прийти позже, чем ожидается, и любые изменения в startup order могут сломать first-open UX.
- Любые попытки "улучшить" hydration могут случайно зацепить `window`, `localStorage`, `navigator` или `useSearchParams()` и сломать prerender/build.
- Сокращение логов может ухудшить on-call диагностику, если не сохранить masked correlation identifiers.
- Попытка автоматизировать reconciliation слишком агрессивно может задвоить provider calls или сделать ложные retry.
- Локальная починка `order/[id]` может случайно сломать Telegram-theme-dependent inline styles, если blindly заменить всё на обычные классы.

## Шаги (журналы)

- [Шаг 1. Client startup orchestration и hydration boundaries](./phase-10/step-1-client-startup-and-hydration.md)
- [Шаг 2. UI hardening для `order/[id]`](./phase-10/step-2-order-page-ui-hardening.md)
- [Шаг 3. Provider и payment logging minimization](./phase-10/step-3-logging-minimization.md)
- [Шаг 4. Payment/provider reconciliation и operational visibility](./phase-10/step-4-payment-provider-reconciliation.md)
- [Шаг 5. Wiki и rollout guardrails](./phase-10/step-5-wiki-and-rollout-guardrails.md)

## Верификация

- Cold start Telegram Mini App:
  - не появляется blank screen дольше baseline;
  - auth восстанавливается или корректно деградирует без пропуска стартовой логики;
  - `TelegramRedirectHandler` больше не зависит от blind fixed delay.
- Маршруты с `useSearchParams()` не ломают build/prerender и остаются обёрнуты в согласованный pattern там, где это нужно.
- `client/app/order/[id]/page.tsx` рендерится с текущим design system и без visual regressions на mobile.
- Покупка eSIM картой:
  - order создаётся как раньше;
  - webhook path CloudPayments не ломается;
  - при успешной оплате и успешной выдаче пользователь получает тот же happy path.
- Пополнение баланса через CloudPayments:
  - идемпотентность не деградирует;
  - delayed balance refresh остаётся рабочим.
- Failure scenario:
  - provider issuance error после successful payment фиксируется в логах/операционном сигнале без raw sensitive dump;
  - есть понятный путь для ручного или ограниченного retry.
- `npm run build` для `client` и `backend` проходит.
- Точечные smoke checks по `client` и `backend` проходят без новых type/runtime regressions.

## Журнал

- **[2026-05-08]** Фаза создана по результатам code-backed аудита `docs/audits/audit.md`.
- **[2026-05-08]** Scope фазы сознательно ограничен stabilizing/hardening работами. Массовая SSR/RSC migration и retirement Robokassa исключены как отдельные будущие инициативы.
- **[2026-05-08]** Шаги 1-4 сведены к production-safe baseline без расширения архитектурного scope: startup coordination переведена на explicit readiness signals, `order/[id]` выровнен под текущий design system, payment/provider logs сокращены до masked baseline, а paid-but-failed incidents получили derived reconciliation signal вместо новой queue platform.

## Rollout Guardrails

- Не превращать follow-up по этой фазе в массовую SSR/RSC migration: текущий client runtime остаётся browser-first и App Router client-heavy по архитектурным причинам.
- Не убирать cached auth restore из `AuthProvider` как "cleanup": в рамках Phase 10 это intentional UX tradeoff, а не defect.
- Не использовать welcome-video splash на `client/app/page.tsx` как auth/bootstrap gate и не связывать её длительность с Telegram SDK readiness.
- Не возвращать blind fixed delays в `TelegramRedirectHandler`: coordination должна оставаться через `isBootstrapped`, `isTelegramReady` и `mojo:telegram-sdk-ready`.
- Не удалять `dynamic = 'force-dynamic'` у browser-bound `client/app/profile/page.tsx` без отдельного server-safe redesign этой страницы.
- Не возвращать raw Robokassa/eSIM Access payload logging по умолчанию. Если нужен глубокий разбор инцидента, использовать временный `DEBUG_SENSITIVE_LOGS=true`.
- Не трактовать `order.reconciliation` как durable workflow engine: это admin/support triage marker, а не автоматический retry/refund оркестратор.
- Не удалять Robokassa как legacy path и не обещать business retirement без отдельной migration phase.

## Follow-up Backlog

- Отдельная SSR/RSC migration phase для public routes только после появления server-safe auth/api transport.
- Отдельная payment retirement/migration phase, если бизнес подтвердит вывод Robokassa из runtime.
- Отдельная provider abstraction cleanup phase, если fallback/provider split-brain станет реальной operational проблемой.
- Отдельная reconciliation automation phase, если derived admin marker перестанет покрывать support workload.

## Ссылки

- [Корневой документ wiki](../README.md)
- [Project Phases & Roadmap](./README.md)
- [Аудит `client` / payments / provider flows](../audits/audit.md)
- [Phase 4: Loyalty & Referral Wiring](./phase-4-loyalty-and-referral-wiring.md)
- [Phase 5: eSIM Usage, Status & Activation](./phase-5-esim-usage-status-and-activation.md)
- [Phase 8: API Security Infrastructure](./phase-8-api-security-infrastructure.md)
