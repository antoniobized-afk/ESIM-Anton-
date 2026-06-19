# Step 08 — Verification, rollout и wiki sync

> [Назад к Phase 19](../phase-19-telegram-broadcasts.md)

## Цель

Закрыть Phase 19 только после end-to-end проверки очереди, delivery semantics,
admin controls, bot opt-out и документации.

## Что нужно сделать

- Провести automated baseline:
  - backend unit tests по `telegram` и `telegram-broadcasts`;
  - controller guard tests;
  - audience builder tests;
  - worker retry/rate-limit tests;
  - admin type-check;
  - bot type-check;
  - Prisma validate.
- Провести local/manual smoke:
  - создать draft;
  - отправить preview;
  - запустить small campaign на тестовых contacts;
  - проверить pause/resume/cancel;
  - проверить opt-out exclusion;
  - проверить simulated blocked/429/5xx через mocked client или controlled test
    seam.
- Подготовить production rollout checklist:
  - Redis env presence;
  - queue worker enabled;
  - free-mode rate limit value;
  - paid mode disabled;
  - first campaign max audience cap;
  - admin operator roles;
  - rollback/disable switch.
- Обновить wiki:
  - `docs/architecture/telegram-broadcast-runtime.md`;
  - `docs/architecture/README.md`;
  - `docs/architecture/module-map.md`, если новый module уже реализован;
  - `docs/architecture/system-overview.md`, если runtime-компоненты изменились;
  - gotchas, если обнаружены новые runtime caveats.
- Обновить phase journal и отметить реализованные шаги.

## Результат шага

- Phase 19 имеет release-candidate или completed verdict с явными
  production preflight условиями.
- Документация отражает фактический код, а не только первоначальный дизайн.
- Следующая сессия может продолжить поддержку без повторного аудита с нуля.

## Зависимости

- Steps 01-07.

## Статус

- `planned`

## Журнал изменений

### 2026-06-19

- Шаг создан при проектировании Phase 19.

## Файлы

- `docs/phases/phase-19-telegram-broadcasts.md`
- `docs/phases/README.md`
- `docs/architecture/telegram-broadcast-runtime.md`
- `docs/architecture/README.md`
- `docs/architecture/module-map.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/gotchas/*`
- affected backend/admin/bot files from previous steps.

## Тестирование / Верификация

- `pnpm --filter backend exec prisma validate`
- `npx tsc --noEmit -p tsconfig.json` в backend.
- `npx tsc --noEmit` в admin.
- `npx tsc --noEmit` в bot.
- Targeted Jest suites для новых backend services/controllers/processors.
- `git diff --check`.
- Manual smoke checklist зафиксирован в phase journal.
