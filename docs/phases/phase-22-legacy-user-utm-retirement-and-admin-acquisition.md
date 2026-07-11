# Phase 22: Удаление legacy User UTM и ясное привлечение в admin users

> [Корневой документ wiki](../README.md)

## Цель

Удалить ложный параллельный UTM-контур на `User` и сделать список
пользователей фактически согласованным с Phase 21: оператор видит подтверждённую
registration attribution по кампании и отдельный referral-факт уже в compact
таблице, а подробная карточка объясняет registration snapshot и поздние
касания без подмены их смысла.

## Результат

- `MarketingCampaign` и immutable marketing snapshots остаются единственными
  владельцами campaign UTM; `User.utm*` отсутствуют в API, Prisma Client и БД.
- `GET /users` получает bounded backend-owned marketing registration summary
  без touch history и без N+1; detail timeline остаётся отдельным route.
- Колонка «Атрибуция» заменена на «Привлечение»: campaign и referral badges
  показываются независимо и могут существовать одновременно.
- Пользователь, зарегистрированный по web, bot или Mini App campaign, видит в
  строке campaign name/code, channel и UTM, а не прочерк.
- Direct, pending, registration-not-tracked и no-state различаются явно;
  login identity и позднее касание не выдаются за источник регистрации.
- Physical drop проходит отдельным совместимым релизом после zero-data gate и
  не ломает предыдущую рабочую версию backend во время Railway rollout.

## Оценка

- Размер фазы: `large`
- Ожидаемое число шагов: `6`
- Основные риски:
  - удалить колонки до остановки всех readers старого Prisma Client;
  - снова смешать campaign, referral и login identity в один synthetic winner;
  - показать late current touch как registration attribution;
  - добавить N+1 marketing request на строки `/users`;
  - потерять разные first/last representatives при визуальном dedupe;
  - объявить zero-data или production readiness без разрешённого DB/runtime
    evidence.

## Зависит от

- [Phase 20](./phase-20-admin-users-table-identity-attribution.md) — текущий
  admin users read model и compact table/detail boundary.
- [Phase 21](./phase-21-marketing-attribution-and-campaign-links.md) — campaign,
  touch, registration snapshot и user timeline owners; фаза завершена с
  подтверждённым production rollout и live Telegram transport.
- [Marketing Attribution Runtime](../architecture/marketing-attribution-runtime.md)
  — durable ownership и compact acquisition summary contract.

## Пререквизиты

- На каждом целевом окружении разрешён read-only aggregate по legacy UTM без
  чтения самих значений.
- Phase 21 завершена; registration lifecycle, timeline API и реальные
  web/bot/Mini App transport flows подтверждены её closure evidence.
- Текущий bot consumer подтверждён как не отправляющий UTM в
  `/users/find-or-create`; вне-репозиторные consumers должны быть исключены
  отдельным transport audit.
- Release A может быть полностью развёрнут и проверен до запуска destructive
  Release B.

## Архитектурные решения

- Campaign UTM не копируются в `User`; compact users summary читает только
  immutable registration snapshots через marketing owner.
- `MarketingUserRegistrationSummaryService` — целевой exported batch owner:
  один запрос на canonical user ids страницы, без module cycle и per-row calls.
- `users` композирует два независимых поля: `marketingAttributionSummary` и
  `referralSummary`; generic `attributionSummary.buckets` удаляется.
- UI-колонка называется «Привлечение». Marketing и referral не выбирают общего
  победителя и не скрывают друг друга.
- Derived read states: `ATTRIBUTED`, `DIRECT`, `PENDING`,
  `REGISTRATION_NOT_TRACKED`, `NO_STATE`. UI label для `DIRECT` — «Без
  кампании».
- Logical retirement и physical drop разделены на Release A/Release B.
  Transitional schema seam существует только в phase evidence и удаляется до
  closure; target runtime не содержит compatibility mode.
- Migration имеет тот же meaningful-value predicate, что read-only preflight,
  и abort guard до `DROP COLUMN`.
- Применимы `INV-ARCH-1`, `INV-BND-1`, `INV-DI-1`, `INV-DTO-1`,
  `INV-TYPE-1`, `INV-PRISMA-1`, `INV-REUSE-1`, `INV-VER-1..4` и
  `INV-DOC-1`.

## Шаги

1. [Step 01 — Runtime audit, contract lock и data preflight](./phase-22/step-01-runtime-audit-contract-lock-and-data-preflight.md)
2. [Step 02 — Batch owner marketing registration summary](./phase-22/step-02-marketing-registration-summary-batch-owner.md)
3. [Step 03 — Users API composition и колонка «Привлечение»](./phase-22/step-03-admin-users-acquisition-summary-and-timeline-ui.md)
4. [Step 04 — Logical retirement legacy UTM и Release A](./phase-22/step-04-legacy-user-utm-logical-retirement-release-a.md)
5. [Step 05 — Guarded physical drop и Release B](./phase-22/step-05-legacy-user-utm-guarded-drop-release-b.md)
6. [Step 06 — Cross-surface verification, rollout и wiki sync](./phase-22/step-06-cross-surface-verification-rollout-and-wiki-sync.md)

## Execution topology

Рабочее правило:

- Одна сессия выполняет один step, обновляет step evidence и phase status
  snapshot.

Порядок:

- Step 01 фиксирует data/contract gate.
- Steps 02 и 03 создают factual list read model и presentation.
- Step 04 завершает application-level retirement и открывает Release A.
- Step 05 разрешён только после доказанного полного rollout Release A и
  повторного zero-data preflight.
- Step 06 закрывает phase после Release B и реальных browser/runtime checks.

## Верификация

- Campaign registration через web, bot и Mini App показывает campaign в
  строке `/users`, а detail сохраняет ту же immutable registration semantics.
- Campaign + linked referral показываются двумя независимыми badges; identity
  остаётся в «Вход».
- `NO_STATE`, `REGISTRATION_NOT_TRACKED`, `PENDING`, `DIRECT` и `ATTRIBUTED`
  подтверждены backend tests и desktop/narrow browser smoke.
- Users page делает bounded marketing batch read, а не запрос на пользователя;
  query count и page-size behavior доказаны тестом.
- Release A работает при физических legacy columns; Release B upgrade удаляет
  их только при zero-data и не ломает users/auth/bot/admin flows.
- Consumer audit охватывает `backend`, `admin`, `client`, `bot`, `shared` и
  Prisma migrations; external/production gates остаются явными.

## Связанные документы

- [Marketing Attribution Runtime](../architecture/marketing-attribution-runtime.md)
  — target ownership, state semantics и compact summary boundary.
- [Phase 20 Step 03](./phase-20/step-03-admin-safe-user-read-model-and-attribution.md)
  — исторический owner текущего `attributionSummary`.
- [Phase 21 Step 06](./phase-21/step-06-admin-campaign-workspace-and-user-timeline.md)
  — существующий user timeline endpoint и detail UI.
- [Data and Migrations Gotchas](../architecture/gotchas/data-and-migrations.md)
  — migration/rollout ограничения.

## Статус / Evidence

- Status: `planned`
- Current step: Step 01.
- Last evidence: план re-baseline выполнен по live schema, users/auth/bot
  consumers и Phase 21 timeline; durable target зафиксирован в Marketing
  Attribution Runtime.
- Links: [Step 01](./phase-22/step-01-runtime-audit-contract-lock-and-data-preflight.md).
