# Phase 20: Admin Users Table Identity & Attribution

> [Корневой документ wiki](../README.md)

## Цель

Сделать `/users` в админке рабочей support-таблицей: администратор быстро
видит, кто пользователь, через какие способы входа он авторизуется, какая у
него атрибуция, финансовая ценность и какие действия безопасно доступны.

Фаза не меняет ownership бизнес-аккаунта: `User.id` остается canonical owner
заказов, платежей, балансов, referral/promo связей и уведомлений.

## Результат

- `GET /users` получил backend-owned `page`, `limit`, `search`, `sortBy`,
  `sortOrder`: поиск/сортировка выполняются до pagination, default —
  `createdAt DESC`.
- Admin users API возвращает admin-safe read model вместо прямого Prisma
  object: decimal/bigint/date сериализуются явно, `providerSubject`, metadata
  и legacy `authProvider/providerId` не попадают в list/detail response.
- Колонка `Провайдер` заменена на `Вход`: chips строятся по `UserIdentity`
  через backend label owner, без fallback на legacy slot.
- Колонка `Источник` заменена на `Атрибуция`: backend summary показывает
  referral, UTM и entry-channel buckets вместе, если фактов несколько.
- Admin `/users` стал compact scan/action surface с URL-state
  search/sorting, стабильными sortable headers (`balance`, `totalSpent`,
  `createdAt`) и admin-only detail modal через `GET /users/admin/:id`.
- Loyalty badge presentation вынесен в shared owner
  `shared/loyalty-level-presentation.ts`; цвета не хранятся в Prisma и не
  являются pricing/runtime contract.
- User-facing users responses переведены на whitelist read model
  `users/user-profile-read-model.ts`; schema drop `users.authProvider/providerId`
  оставлен за отдельным audit/backfill blocker path.

## Архитектурные решения

- `UserIdentity` — единственный source of truth для способов входа в admin
  users UI. Durable contract зафиксирован в
  [Auth Identity Runtime](../architecture/auth-identity-runtime.md).
- Admin diagnostic data не расширяет mixed `GET /users/:id`; admin detail живет
  за `JwtAdminGuard` в `GET /users/admin/:id`.
- Sort whitelist ограничен direct stable keys из
  `shared/user-sorting.ts`: `id`, `balance`, `bonusBalance`, `totalSpent`,
  `loyaltyLevel`, `createdAt`. `name`, `telegram` и `attribution` остаются
  display/search-only.
- `Атрибуция` в этой фазе — read model над текущими referral/UTM/entry-channel
  данными. Campaign/touch tracking, `/go/:code`, CPA dashboard и полноценный
  marketing attribution runtime вынесены в будущую фазу после отдельного audit.
- Legacy `authProvider/providerId` остаются в schema только из-за live
  blockers: auth resolver continuity, identity backfill и merge-preflight
  drift-check. UI/API не используют их как display fallback.
- Loyalty colors являются presentation policy. Runtime/pricing смысл уровней
  остается в [Loyalty Runtime](../architecture/loyalty-runtime.md).

## Шаги

1. [Step 01 — Runtime audit и admin users contract lock](./phase-20/step-01-runtime-audit-and-admin-users-contract-lock.md)
2. [Step 02 — Backend users list query и sorting foundation](./phase-20/step-02-backend-users-list-query-and-sorting.md)
3. [Step 03 — Admin-safe user read model и attribution summary](./phase-20/step-03-admin-safe-user-read-model-and-attribution.md)
4. [Step 04 — Legacy identity slot deprecation boundary](./phase-20/step-04-legacy-identity-slot-deprecation-boundary.md)
5. [Step 05 — Loyalty level presentation owner](./phase-20/step-05-loyalty-level-presentation-owner.md)
6. [Step 06 — Admin users table, toolbar и detail modal](./phase-20/step-06-admin-users-table-toolbar-and-detail-modal.md)
7. [Step 07 — Cross-surface verification и wiki sync](./phase-20/step-07-cross-surface-verification-and-wiki-sync.md)

## Связанные документы

- [Module Map](../architecture/module-map.md) — owners для backend users,
  admin `/users` и shared sort/presentation contracts.
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md) — граница
  `User` vs `UserIdentity`, legacy slot blockers и admin/user read models.
- [Loyalty Runtime](../architecture/loyalty-runtime.md) — runtime loyalty
  contract и presentation boundary.
- [Referral Runtime](../architecture/referrals-runtime.md) — referral
  attribution и partner link policy.
- [Security Gotchas](../architecture/gotchas/security.md) — identity/security
  ограничения.
- [Data and Migrations Gotchas](../architecture/gotchas/data-and-migrations.md)
  — почему drop legacy identity slot требует отдельного DB/backfill evidence.

## Статус

✅ Завершена.
