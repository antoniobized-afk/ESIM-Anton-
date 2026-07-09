# Step 03 — Admin-safe user read model и attribution summary

> [Назад к Phase 20](../phase-20-admin-users-table-identity-attribution.md)

## Цель

Заменить неявную отдачу Prisma `User` object на явный admin-safe read model для
list/detail users surface: identities, attribution и support hints должны быть
понятны администратору и безопасны по данным.

## Что нужно сделать

- Вынести serializer/read-model owner для admin users list.
- Для list item вернуть только safe поля:
  - `User` contact/support hints;
  - `balance`, `bonusBalance`, `totalSpent`;
  - `loyaltyLevel`;
  - `identityProviders` из `UserIdentity`;
  - `attributionSummary`;
  - `createdAt`, flags, delete-relevant minimal state.
- Для identities:
  - включить `provider`, `label`, `email`, `emailVerified`, `displayName`,
    `linkedAt`, `lastLoginAt`;
  - не отдавать `providerSubject`;
  - не отдавать raw `metadata`;
  - не копировать provider label map в admin UI, если backend уже может вернуть
    label.
- Для attribution:
  - показать referral bucket при `referredById` и/или `referralLinkId`;
  - показать UTM bucket при `utmSource`/`utmMedium`/`utmCampaign`;
  - показать entry channel для Telegram/direct path, если нет explicit
    referral/UTM;
  - `unknown` использовать только при отсутствии всех фактов;
  - если referral и UTM есть вместе, response содержит оба bucket;
  - не добавлять скрытые `Campaign`/`Touch` поля, synthetic first-touch или
    last-touch placeholders ради будущей marketing attribution phase.
- Добавить admin-only detail read model:
  - отдельный route или явно защищенная ветка;
  - не расширять mixed `GET /users/:id` admin diagnostics так, чтобы user JWT
    мог увидеть support fields.
- Добавить tests:
  - `providerSubject` и metadata не попадают наружу;
  - referral + UTM отображаются вместе;
  - user-facing `GET /users/:id` не получает admin-only detail data.

## Результат шага

- Admin list/detail имеют явный DTO/read model.
- UI больше не должен собирать бизнес-смысл из сырых Prisma fields.
- Identity и attribution semantics разведены.
- Нет утечки raw OAuth/Telegram subject через admin table или mixed user route.
- `attributionSummary` стабилен как admin DTO: будущая marketing attribution
  phase сможет заменить backend-источник данных, не меняя текущий UI contract.

## Не входит в scope

- Удаление legacy schema fields.
- Визуальная перестройка таблицы.
- Полноценный first-touch acquisition-source contract.
- `Campaign`, `Touch`, `/go/:code`, public tracking endpoint, cookies/session
  binding, Telegram campaign payload parser, order attribution snapshots,
  campaign dashboard, CPA/блогеры и Excel export.

## Зависимости

- Step 01.
- Step 02 для финальной list query интеграции.

## Статус

`completed`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.
- После review `docs/work/session.md` scope шага зафиксирован как текущий admin
  users read model; полноценный campaign/touch tracking вынесен в будущий
  audit-first phase.
- Закрыт 2026-07-09: добавлен backend owner
  `backend/src/modules/users/admin-user-read-model.ts` с explicit Prisma
  include/select для admin users list/detail. `UserIdentity.providerSubject` и
  raw `metadata` не запрашиваются и не сериализуются; decimal/bigint/date
  приводятся в контролируемые string/ISO поля.
- Provider labels вынесены в общий backend helper
  `backend/src/modules/auth/identity/auth-identity-provider-labels.ts`;
  `AuthIdentityManagementService` и admin users read model используют один
  owner, без третьей карты labels в admin UI.
- `GET /users` теперь возвращает `identityProviders` и
  `attributionSummary.buckets` поверх backend read model. Referral и UTM
  buckets могут возвращаться вместе; entry channel используется только когда
  нет explicit referral/UTM; `unknown` остается только для отсутствия всех
  фактов.
- Добавлен admin-only detail boundary `GET /users/admin/:id` под
  `JwtAdminGuard`. Mixed `GET /users/:id` не расширен admin diagnostics и
  остается user/admin profile route с прежней access check.
- Admin consumer contract минимально синхронизирован: `usersApi.getById`
  читает `/users/admin/:id`, `AdminUser` больше не описывает legacy
  `authProvider/providerId`, текущая `/users` таблица читает
  `identityProviders`/`attributionSummary` без legacy fallback.
- Review follow-up 2026-07-09: `GET /users/:id/stats` теперь возвращает
  `user` через тот же admin-safe read model (`findAdminById`), поэтому
  `UserStatsResponse.user: AdminUser` больше не расходится с backend contract
  и не протаскивает legacy `authProvider/providerId`.
- Targeted tests:
  `pnpm --filter backend test -- users.service.spec.ts users.controller.spec.ts`
  green (28 tests). Covered privacy (`providerSubject`/`metadata` not exposed),
  referral+UTM buckets together, admin-only detail route/guard, user-facing
  route separation and stats `user` read-model alignment.
- Build/gates: `pnpm --filter backend build` green; `pnpm --filter admin lint`
  green; `pnpm --filter admin build` green; `git diff --check` green.

## Файлы

- `backend/src/modules/users/users.controller.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/*read-model*`
- `backend/src/modules/users/*serializer*`
- `backend/src/modules/users/users.controller.spec.ts`
- `backend/src/modules/users/users.service.spec.ts`
- `backend/src/modules/auth/identity-management/*` только если reuse требует
  вынести provider labels.

## Тестирование / Верификация

- `pnpm --filter backend test -- users.service.spec.ts users.controller.spec.ts`
- Targeted spec для admin-safe read model.
- `pnpm --filter backend build` или `pnpm --filter backend exec nest build`
  при Prisma engine lock.
- `git diff --check`.
- Lookup IDs: `INV-DTO-1`, `INV-TYPE-1`, `INV-AUTH-1`, `INV-SEC-1`,
  `INV-REUSE-1`, `INV-VER-2..4`.
