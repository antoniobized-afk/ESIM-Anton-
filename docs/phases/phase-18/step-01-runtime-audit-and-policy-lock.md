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
- Обновить architecture wiki с текущим и целевым identity contract.
- Зафиксировать policy lock: no silent merge, no auto link by email, no business
  asset movement inside login resolver.

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
