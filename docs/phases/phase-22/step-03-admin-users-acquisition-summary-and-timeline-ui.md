# Step 03 — Users API composition и колонка «Привлечение»

> [Назад к Phase 22](../phase-22-legacy-user-utm-retirement-and-admin-acquisition.md)

## Цель

Синхронно заменить misleading `attributionSummary` в admin users contract и
UI на компактное factual представление campaign registration + referral.

## Что нужно сделать

- После формирования одной users page вызвать marketing batch owner один раз
  и скомпозировать `marketingAttributionSummary` по canonical user id.
- Заменить generic `attributionSummary.buckets` на отдельный
  `referralSummary`; не превращать referral и campaign в mutually exclusive
  winner.
- Синхронизировать `GET /users`, `GET /users/admin/:id`, stats user payload и
  admin types/consumers.
- Переименовать колонку «Атрибуция» в «Привлечение» и заменить
  `UserAttributionCell` на narrow presentation component.
- Для attributed registration показывать campaign name/code, channel и
  компактный UTM tuple; одинаковый first/last показывать одной карточкой с
  roles, разные — двумя явно подписанными representatives.
- Показывать referral отдельным зелёным badge, даже если он пришёл через
  linked marketing campaign.
- Убрать прочерк как registration verdict: отображать «Без кампании»,
  «Ожидает фиксации», «Регистрация не отслеживалась» или «Нет данных».
- В detail переименовать секцию в «Маркетинговая атрибуция», перевести labels
  и применить ту же state semantics; current touches оставить отдельной
  временной группой.

## Результат шага

- Mini App/web/bot attributed user видит campaign уже в users row.
- Campaign и referral одновременно видимы и не перезаписывают друг друга.
- Email/Telegram identity без acquisition facts не создаёт source label.
- Late touch существующего пользователя не называется источником регистрации.
- Users list не получает touch history и не делает per-row API requests.
- Desktop и narrow table/modal остаются компактными и без overflow.

## Зависимости

- Step 02.

## Статус

`planned`

## Evidence

- Пока отсутствует; текущий UI показывает только referral/legacy UTM buckets и
  выводит `—` при пустом summary.

## Файлы

- `backend/src/modules/users/{users.service,admin-user-read-model}.ts`
- `backend/src/modules/users/*.spec.ts`
- `admin/components/Users.tsx`
- `admin/components/users/UserAttributionCell.tsx`
- `admin/components/users/UserDetailsModal.tsx`
- `admin/components/users/user-formatting.ts`
- `admin/components/marketing-attribution/UserMarketingTimeline.tsx`
- `admin/lib/{api,types}.ts`

## Тестирование / Верификация

- Backend contract tests: attributed/direct/pending/not-tracked/no-state,
  referral-only и campaign+referral.
- Regression: users page вызывает batch owner один раз на итоговую страницу,
  включая loyalty-level partitioned pagination.
- `pnpm --filter backend build` и targeted users/marketing specs.
- `pnpm --filter admin lint`; `pnpm --filter admin build`.
- Browser smoke 1440px/390px: campaign row, two badges, all empty/status states,
  first/last dedupe и detail history.
- Consumer audit stats/detail/list/admin types.
- Lookup: `INV-BND-1`, `INV-DI-1`, `INV-TYPE-1`, `INV-CLIENT-1`,
  `INV-REUSE-1`, `INV-VER-1..4`.
