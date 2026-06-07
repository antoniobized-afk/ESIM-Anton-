# Шаг 7. Verification, rollout и wiki sync

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Закрыть фазу проверкой миграции, auth flows, downstream ownership invariants и
обновлением durable wiki.

## Что нужно сделать

- Прогнать backend targeted tests и type-check.
- Прогнать client/admin/bot type-check для затронутых clients.
- Провести manual smoke:
  - email login;
  - OAuth login;
  - Telegram Widget;
  - Telegram WebApp;
  - bot `/start`;
  - checkout purchase;
  - saved-card charge;
  - referral registration;
  - partner promo reward;
  - notifications.
- Подготовить DB migration preflight для production.
- Обновить `docs/architecture/auth-identity-runtime.md` по фактической
  реализации.
- Обновить `docs/architecture/module-map.md`, если появились новые services или
  admin/client pages.
- Обновить `docs/architecture/gotchas.md`, если найдены migration/auth risks.

## Результат шага

- Phase 18 готова к deploy только после green verification и migration preflight.
- Wiki отражает фактический runtime, а не первоначальный план.

## Зависимости

- Шаги 2-6.

## Статус

`planned`

## Журнал изменений

### 2026-06-06

- Шаг запланирован как mandatory final verification gate.

## Файлы

- `docs/architecture/auth-identity-runtime.md`
- `docs/architecture/module-map.md`
- `docs/architecture/gotchas.md`
- `docs/phases/phase-18-account-identity-linking-and-merge.md`
- `docs/phases/phase-18/*`

## Тестирование / Верификация

- Backend targeted Jest suite.
- Backend type-check.
- Client/admin/bot type-check as applicable.
- Production migration preflight before `prisma migrate deploy`.
