# Шаг 1. Runtime audit и identity policy lock

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Зафиксировать текущий auth/account runtime и запретить реализацию account
linking как набора локальных патчей поверх `User.authProvider/providerId`.

## Что нужно сделать

- Сверить Prisma `User` и все текущие login flows.
- Описать, где `User.id` используется как owner key.
- Зафиксировать affected surfaces: orders, payments, saved cards, referrals,
  promo codes, notifications, client, bot, admin.
- Зафиксировать live divergences:
  - bot path создает Telegram user по `telegramId` без legacy provider slot;
  - backend имеет VK callback, но client login UI сейчас не показывает VK;
  - phone OTP login flow в live code не найден, `User.phone` остается contact
    field;
  - текущий OAuth `state` является return redirect, а не signed link nonce.
- Обновить architecture wiki с текущим и целевым identity contract.
- Зафиксировать policy lock: no silent merge, no auto link by email, no business
  asset movement inside login resolver, no OAuth link without signed
  authenticated link state.

## Результат шага

- Есть runtime audit в `docs/architecture/auth-identity-runtime.md`.
- В phase doc перечислены архитектурные решения и downstream contracts.
- Следующие шаги могут проектировать schema/backfill без догадок.

## Зависимости

Нет.

## Статус

`completed`

## Журнал изменений

### 2026-06-06

- Выполнен аудит live code по auth/users/orders/payments/referrals/promo-codes
  и notification surfaces.
- Зафиксировано, что `User` является business account, а не identity record.

### 2026-06-07

- Повторно сверены live auth/bot/downstream contracts перед стартом реализации.
- В policy lock добавлены ограничения по phone/VK surface, signed OAuth link
  state, normalized email preflight и audit trail для link/unlink.

## Файлы

- `docs/architecture/auth-identity-runtime.md`
- `docs/phases/phase-18-account-identity-linking-and-merge.md`
- `backend/prisma/schema.prisma`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/users/users.service.ts`
- `client/components/AuthProvider.tsx`
- `bot/src/api.ts`

## Тестирование / Верификация

- Документ сверен с live files.
- No code changes на этом шаге.
- Перед следующими шагами нужно сохранить эти guardrails в schema/runtime
  implementation, а не только в фазовом описании.
