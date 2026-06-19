# Step 06 — Admin Broadcasts UI и operator controls

> [Назад к Phase 19](../phase-19-telegram-broadcasts.md)

## Цель

Добавить в админку рабочую поверхность для Telegram campaigns без превращения
ее в маркетинговый CRM-комбайн.

## Что нужно сделать

- Добавить route `admin/app/(admin)/broadcasts/page.tsx`.
- Добавить navigation item в `AdminShell`.
- Добавить typed API methods в `admin/lib/api.ts`.
- Добавить types в `admin/lib/types.ts`.
- Создать `TelegramBroadcasts` component:
  - campaigns table;
  - status badges;
  - progress counters;
  - create/edit draft modal;
  - audience estimate;
  - preview action;
  - schedule/start action;
  - pause/resume/cancel actions;
  - error/details modal.
- Использовать существующие UI primitives:
  - `Button`;
  - `Modal`;
  - `ConfirmDialog`;
  - `Toast`;
  - `Table`;
  - `Spinner`.
- Не добавлять nested cards и marketing hero layout.
- Не показывать raw Telegram token, raw payload или full private error dumps.
- Отразить role restrictions в UI, но не полагаться на UI как на security
  boundary.

## Результат шага

- Admin operator может управлять campaigns через UI.
- UI показывает состояние очереди и ошибки достаточно для поддержки.
- Все опасные действия требуют backend validation и confirm dialog.

## Зависимости

- Step 05.

## Статус

- `planned`

## Журнал изменений

### 2026-06-19

- Шаг создан при проектировании Phase 19.

## Файлы

- `admin/app/(admin)/broadcasts/page.tsx`
- `admin/components/TelegramBroadcasts.tsx`
- `admin/components/AdminShell.tsx`
- `admin/lib/api.ts`
- `admin/lib/types.ts`
- `admin/components/ui/*` только если существующих primitives реально
  недостаточно.

## Тестирование / Верификация

- `npx tsc --noEmit` в admin.
- Manual UI smoke:
  - empty state;
  - draft create/edit;
  - estimate;
  - preview;
  - start;
  - pause/resume/cancel;
  - errors modal;
  - narrow viewport table scrolling.
- Проверить, что SUPPORT не видит destructive controls или получает disabled
  state, но backend все равно запрещает mutation.
