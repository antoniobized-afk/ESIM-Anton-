# Phase Templates

> Готовые шаблоны для новых phase-документов и step journals.
> Использовать вместе с [../PHASE_AUTHORING_GUIDE.md](../PHASE_AUTHORING_GUIDE.md).

## Что здесь лежит

- [phase-template.md](./phase-template.md)
  Базовый шаблон для нового файла `phase-N-*.md`.

- [step-template.md](./step-template.md)
  Базовый шаблон для нового файла `step-XX-*.md` внутри папки конкретной фазы.

## Как использовать

1. Выбрать номер и slug новой фазы.
2. Скопировать [phase-template.md](./phase-template.md) в `docs/phases/phase-N-your-topic.md`.
3. Создать каталог `docs/phases/phase-N/`.
4. Скопировать [step-template.md](./step-template.md) для каждого шага.
5. После создания документов обновить [../README.md](../README.md), если меняется roadmap или статус.

## Принцип

Шаблоны должны помогать держать единый стиль, а не подменять thinking.
Если фаза спорит с текущей архитектурой, сначала обновляется профильная wiki (Architecture Gate, `INV-ARCH-1`), потом шаблон заполняется под новую модель.
