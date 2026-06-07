# Шаг 6. Admin/support duplicate preflight и merge audit

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Создать безопасный admin/support контур для анализа дублей и подготовки merge
решений без автоматического объединения пользователей в login flow. По
умолчанию шаг реализует read-only preflight; mutation merge допускается только
после утвержденной policy для каждой affected relation.

## Что нужно сделать

- Добавить backend preflight endpoint для пары `sourceUserId -> targetUserId`.
- Preflight должен показать affected assets:
  - balances;
  - bonusBalance/loyalty/totalSpent;
  - orders/eSIM;
  - transactions;
  - saved cards;
  - referral links;
  - promo owner policies;
  - reward snapshots;
  - push subscriptions;
  - notification targets;
  - identities.
- Preflight должен отдельно показать identity conflicts:
  - provider subject already linked to another `User`;
  - duplicate normalized email;
  - Telegram login identity differs from `User.telegramId` notification field;
  - legacy `authProvider/providerId` conflicts with `UserIdentity`.
- Зафиксировать conflict policy:
  - provider identity already linked;
  - both users have balances;
  - both users have saved cards;
  - source owns partner links/promos;
  - historical financial ledger.
- Добавить audit model или audit log record для merge decisions.
- Если mutation merge включается в этой фазе, реализовать его отдельным
  сервисом с transaction boundary и explicit operator/reason.
- Mutation merge, если включается, должна быть allowlisted по relations:
  каждый перенос `Order`, `Transaction`, `CloudPaymentsCardToken`,
  `ReferralLink`, `PromoCode`, `PromoCodeRedemption`, `PushSubscription` и
  identity выполняется явно, с before/after snapshot и без пересчета
  исторического ledger.
- Не вызывать merge из `AuthService` или OAuth callback.

## Результат шага

- Support может увидеть, что произойдет при merge, до любых мутаций.
- Любой merge имеет audit trail.
- Login resolver остается чистым identity resolver, а не hidden data mover.
- Если per-relation policy не утверждена, Phase 18 завершается с read-only
  preflight и без data-moving merge mutation.

## Зависимости

- Шаг 5.

## Статус

`implemented-local-read-only`

## Журнал изменений

### 2026-06-06

- Шаг запланирован как late-stage capability после стабилизации identity lookup.

### 2026-06-07

- Добавлен read-only `UserMergePreflightService`.
- SRP boundary усилен: counting affected assets вынесен в
  `UserMergePreflightAssetsService`, audit write/metadata вынесены в
  `UserMergePreflightAuditService`, а `UserMergePreflightService` оставлен для
  read-only report и conflict policy.
- Добавлен admin-only endpoint
  `GET /users/admin/merge-preflight?sourceUserId=...&targetUserId=...`.
- Preflight возвращает:
  - balances/bonusBalance/totalSpent/loyalty snapshots;
  - counts по orders, transactions, saved cards, referral links, owned promo
    codes, promo redemptions, reward snapshots, push subscriptions,
    notifications;
  - identities source/target как safe view: `providerSubjectHash`,
    masked `providerSubjectPreview`, masked `emailPreview`, без raw
    `providerSubject`;
  - conflicts по duplicate normalized email, Telegram identity/contact drift,
    legacy provider drift, both balances, saved cards, referral/promo owner
    ownership.
- `canMerge=false`, `mutationEnabled=false`: data-moving merge mutation не
  реализована и не включена.
- Preflight пишет audit `MERGE_PREFLIGHT` для source и target user с actor,
  conflict codes и asset counts, но без raw identity subjects.
- Duplicate normalized email conflict details в response используют hash/masked
  preview вместо полного normalized email.
- Preflight не меняет business rows: users, identities, orders, payments,
  saved cards, referrals, promos, push subscriptions и notifications не
  переносятся и не обновляются. Audit write является security/support trail, а
  не data-moving merge mutation.
- Добавлен простой `SUPER_ADMIN` delete для пустых duplicate users:
  `DELETE /users/admin/:id` удаляет `UserIdentity`, `UserIdentityAudit`, push
  subscriptions, notifications и затем `User` в одной transaction. Если есть
  заказы, платежи, карты, баланс, реферальная/партнерская атрибуция или другие
  business rows, endpoint возвращает `409` с причинами. Это не merge и не
  перенос данных между аккаунтами.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/src/modules/users/*`
- `backend/src/modules/users/user-merge-preflight-assets.service.ts`
- `backend/src/modules/users/user-merge-preflight-audit.service.ts`
- `backend/src/modules/users/user-merge-preflight.types.ts`
- `backend/src/modules/users/user-admin-deletion.service.ts`
- `backend/src/modules/users/dto/merge-preflight.dto.ts`
- `backend/src/modules/auth/*`
- `admin/components/Users.tsx`
- `admin/lib/api.ts`
- `admin/lib/types.ts`

## Тестирование / Верификация

- `npx jest modules/users/user-admin-deletion.service.spec.ts modules/users/users.controller.spec.ts --runInBand`
  — passed, 15 tests.
- `npx jest modules/users/user-merge-preflight.service.spec.ts --runInBand` —
  passed, 3 tests after safe identity response and SRP hardening.
- `npx tsc --noEmit -p tsconfig.json` в backend — passed.
- `pnpm --filter admin exec tsc --noEmit -p tsconfig.json` — passed.
- `npx prisma validate` — passed.
- Tests доказывают, что preflight пишет `MERGE_PREFLIGHT` audit, но не меняет
  users, identities, orders, transactions и saved cards; отдельная проверка
  доказывает, что `result.identities` не содержит raw `providerSubject`.
- Merge mutation не реализована; атомарность mutation merge не применима.
- Admin UI для preflight не добавлялся в этом шаге; backend endpoint готов для
  будущей admin surface.
