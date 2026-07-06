# Phase N — Name

> Заменить `N` и `Name` на реальный номер и тему фазы.
> Этот шаблон задает обязательный каркас phase-документа.

## Цель

Коротко описать, какой продуктовый или архитектурный срез должна закрыть эта фаза.

## Результат

- Что появится в системе после завершения фазы.
- Какие user/admin/runtime capabilities будут считаться реализованными.

## Оценка

- Размер фазы: `small | medium | large`
- Ожидаемое число шагов: `3-8`
- Основные риски: перечислить кратко

## Зависит от

- Предыдущие фазы или wiki-решения, без которых эта фаза не может стартовать.

## Пререквизиты

- Какие таблицы, модули, маршруты, guards, jobs или внешние интеграции уже должны существовать.
- Какие продуктовые решения должны быть зафиксированы до начала работ.

## Архитектурные решения

- Phase-specific decisions.
- Ссылки на профильные wiki docs, если меняется durable contract.
- Использованные `INV-*` lookup IDs, если риск найден.

## Шаги

1. [Step 01 — Name](./phase-N/step-01-name.md)
2. [Step 02 — Name](./phase-N/step-02-name.md)
3. [Step 03 — Name](./phase-N/step-03-name.md)

Для фазы в roadmap создать planned step files сразу. Черновик без step files не считать готовым phase contract.

## Execution topology (optional)

Удалить блок, если фаза линейная или маленькая.
Не использовать как план запуска воркеров: по умолчанию одна сессия берёт один step.

Рабочее правило:

- Одна сессия выполняет один step, обновляет step evidence и phase status snapshot.

Порядок:

- Step 01 -> Step 02 -> Step 03.

Независимые шаги, если есть:

- Step 02 и Step 03 можно выполнять в отдельных сессиях после Step 01.

## Верификация

- Phase-level scenario, который доказывает completion.
- Gate/evidence plan (`INV-VER-1`), без копии external rules или test matrix.
- Consumer audit plan, если меняется public/shared contract (`INV-VER-4`).

## Связанные документы

- Architecture wiki / previous phases, которые нужно читать перед реализацией.
- Supporting materials, если они актуальны после сверки с live code.
- Только ссылки и назначение документа. Не копировать содержимое связанных документов.

## Статус / Evidence

- Status: `planned | in_progress | partial | baseline | completed`
- Current step:
- Last evidence:
- Links: step evidence / wiki, без пересказа деталей.
