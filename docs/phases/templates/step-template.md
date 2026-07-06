# Step XX — Name

> Заменить `XX` и `Name` на реальный номер и тему шага.
> Этот шаблон использовать для файлов внутри `docs/phases/phase-N/`.

## Цель

Один законченный подэтап, который можно выполнить и проверить отдельно.

## Что нужно сделать

- Перечислить конкретные проверяемые действия.
- Привязать их к подсистемам, behavior или файлам.
- Не писать абстракции вроде “доделать UI” или “доработать backend”.

## Результат шага

- Acceptance criteria: конкретные условия, каждое из которых можно проверить как pass/fail.
- Какие новые routes, pages, services, jobs или UI states должны появиться.

## Не входит в scope (optional)

Удалить блок, если scope очевиден.

- Что явно исключено из этого шага, чтобы предотвратить scope creep.

## Зависимости

- Какие предыдущие шаги реально блокируют этот.
- Если зависимостей нет, явно написать `Нет`.

## Статус

- `planned | in_progress | partial | baseline | completed`

## Evidence

- 2-5 bullets: фактический результат, deviation from plan, verification evidence.
- Не пересказывать phase doc или architecture wiki.
- Если durable contract изменился, обновить профильный wiki doc и поставить ссылку.

## Файлы

- Перечислить ключевые files/directories ownership, не полный diff.
- Если шаг пока планируется, оставить предварительный список.

## Agent handoff (optional)

Удалить блок, если шаг выполняет main agent или нет безопасного disjoint write set.

- Role: `recon | worker | validation | review`
- Reads:
- Write set:
- Do not touch:
- Gate:

## Тестирование / Верификация

- Какие сценарии подтвердят завершение шага.
- Какие `INV-*` lookup IDs применимы к шагу.
- Gate/evidence: command или manual flow + result.
- Consumer audit, если меняется public/shared contract.
- Длинные логи и копию external rules не вставлять.
