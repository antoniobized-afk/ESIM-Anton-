[⬅️ Назад к главной странице](../README.md)

# Project Phases & Roadmap

> Актуальный индекс незавершенных и планируемых фаз.
> Завершенные фазы хранятся отдельно: [COMPLETED_PHASES.md](./COMPLETED_PHASES.md).

## Статус фаз

| #  | Фаза                                                         | Статус              | Документ                                                                |
| -- | ------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------- |
| 8  | API Security Infrastructure (Helmet, CORS, DTO, Rate Limiting) | ⬜ Не начата         | [phase-8-api-security-infrastructure.md](./phase-8-api-security-infrastructure.md) |
| 12 | Client PWA & Telegram Mini App Refactoring                   | ⬜ Не начата         | [phase-12-client-refactoring.md](./phase-12-client-refactoring.md)       |
| 19 | Telegram Broadcast Campaigns                                 | 🔄 Планирование     | [phase-19-telegram-broadcasts.md](./phase-19-telegram-broadcasts.md)     |
| 21 | Marketing Attribution & Campaign Links                       | 🔄 В работе         | [phase-21-marketing-attribution-and-campaign-links.md](./phase-21-marketing-attribution-and-campaign-links.md) |
| 22 | Удаление legacy User UTM и ясное привлечение в admin users   | ⬜ Не начата         | [phase-22-legacy-user-utm-retirement-and-admin-acquisition.md](./phase-22-legacy-user-utm-retirement-and-admin-acquisition.md) |

**Легенда:** ⬜ Не начата · 🔄 В работе / планирование · ✅ Завершена в [архиве](./COMPLETED_PHASES.md)

## Правило ведения фаз

- В этом README остаются только активные, незавершенные или планируемые фазы.
- Завершенная фаза переносится в [COMPLETED_PHASES.md](./COMPLETED_PHASES.md) с коротким итогом и ссылкой на phase-файл.
- Новый phase-файл и его step journals создаются по [PHASE_AUTHORING_GUIDE.md](./PHASE_AUTHORING_GUIDE.md).
- Для новых документов использовать шаблоны из [templates/README.md](./templates/README.md).
- Если фаза меняет ownership boundary, runtime contract или deployment strategy, сначала обновить профильную wiki (Architecture Gate, `INV-ARCH-1`), потом писать план реализации.
