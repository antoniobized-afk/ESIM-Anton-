# Step 06 — Verification, Rollout Docs And Runtime Wiki

> [Назад к Phase 16](../phase-16-partner-referral-links.md)

## Цель

Закрыть фазу проверкой end-to-end сценариев и обновить wiki так, чтобы новая
сессия понимала реализованный referral runtime без повторного аудита.

## Что нужно сделать

- Обновить `docs/architecture/referrals-runtime.md`:
  - новые Prisma contracts;
  - API surface;
  - dual lookup order;
  - immutable attribution policy;
  - partner bonus percent flow;
  - promo reservation lifecycle;
  - first-purchase pending promo semantics with manual promo priority;
  - web landing/AuthProvider flow;
  - admin analytics surface;
  - commissionable revenue excludes top-up; optional LTV/top-up metric is
    secondary;
  - known boundaries V1.
- При необходимости обновить:
  - `docs/architecture/module-map.md`;
  - `docs/architecture/gotchas.md`;
  - `docs/operations/README.md` или runbook, если появится production migration
    procedure.
- Зафиксировать rollout checklist:
  - выполнить duplicate preflight перед migration;
  - применить migration;
  - проверить generated Prisma Client;
  - smoke admin creation;
  - smoke Telegram partner code;
  - smoke web `/ref/<code>`;
  - smoke purchase completion with partner bonus;
  - smoke first successful purchase with manual promo clears partner pending
    promo without redemption;
  - smoke auto-promo release/consume.
- Обновить phase journal по фактическому результату.
- Если в реализации принято новое архитектурное решение, добавить его в wiki, а не
  оставлять только в коде или PR notes.

## Результат шага

- Фаза имеет проверенный runtime baseline.
- Docs описывают реализованное состояние, а не только план.
- Будущая сессия может начать с `docs/architecture/referrals-runtime.md` и
  `docs/phases/phase-16-partner-referral-links.md`.

## Зависимости

- Steps 01-05.

## Статус

- `done`

## Журнал изменений

### 2026-05-19

- Шаг выделен отдельно, потому что документация referral runtime является
  обязательной частью delivery, а не post-factum cleanup.
- **Верификация**: backend 29/29 tests, backend/client/admin `tsc --noEmit` clean.
- **`referrals-runtime.md`**: полностью переписан под Phase 16. Документирует
  Prisma contracts, API surface, dual lookup, immutable attribution, partner
  bonus percent flow, promo reservation lifecycle, web landing/AuthProvider
  flow, admin analytics, known V1 boundaries.
- **`module-map.md`**: добавлены `ReferralLink`, `PromoCodeRedemption`,
  admin `referral-links`, client `/ref/[code]`, обновлён referrals module.
- **`gotchas.md`**: добавлена gotcha про stale Prisma Client P6001.
- Phase 16 journal финализирован.

## Файлы

- `docs/architecture/referrals-runtime.md`
- `docs/architecture/module-map.md`
- `docs/architecture/gotchas.md`
- `docs/phases/phase-16-partner-referral-links.md`
- `docs/phases/README.md`
- `docs/plans/Enterprise_Plan.md`

## Тестирование / Верификация

- Backend:
  - `npx jest src/modules/referrals/ --runInBand`
  - targeted `orders.service.spec.ts`
  - targeted `promo-codes.service.spec.ts`
  - `npx tsc --noEmit -p tsconfig.json`
- Client:
  - `npx tsc --noEmit --incremental false`
  - route smoke for `/ref/<code>`
- Admin:
  - `npx tsc --noEmit --incremental false`
  - admin smoke for `Партнёрские ссылки`
- Manual:
  - create partner link with and without promo;
  - Telegram `/start ref_<partnerCode>`;
  - web `/ref/<partnerCode>`;
  - purchase completion creates correct partner bonus;
  - manual promo on first successful purchase clears partner pending promo;
  - failed/cancelled/stale order releases promo reservation;
  - detail analytics matches users/orders/transactions and excludes top-up from
    commissionable revenue.
