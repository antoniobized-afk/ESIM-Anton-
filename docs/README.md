# LLM Wiki Entry Point

Цель: выбрать один следующий документ и не раздувать контекст.

## Стартовый маршрут

1. Выбрать один профиль:
   - фаза / roadmap / текущий статус работ -> [phases/README.md](./phases/README.md);
   - runtime / ownership / API / интеграции -> [architecture/README.md](./architecture/README.md);
   - запуск / деплой / сопровождение -> [operations/README.md](./operations/README.md).
2. Открыть один профильный doc и живой code reference.
3. Если появился риск из таблицы ниже, открыть только найденный `INV-*`.
4. Остановить чтение docs и перейти к задаче.

## Risk Lookup

Не открывать `invariants.md` целиком на старте. Если риск появился, найти нужный ID точечно:

| Риск | Lookup |
| --- | --- |
| new local pattern | `rg -n "INV-OBS" docs/architecture/invariants.md` |
| architecture / app boundary | `rg -n "INV-ARCH\|INV-BND" docs/architecture/invariants.md` |
| NestJS DI / module cycle | `rg -n "INV-DI" docs/architecture/invariants.md` |
| endpoint / DTO / types | `rg -n "INV-DTO\|INV-TYPE" docs/architecture/invariants.md` |
| auth / guards / redirects | `rg -n "INV-AUTH\|INV-SEC" docs/architecture/invariants.md` |
| Prisma schema / транзакции | `rg -n "INV-PRISMA\|INV-TX" docs/architecture/invariants.md` |
| client pages / layout | `rg -n "INV-CLIENT" docs/architecture/invariants.md` |
| env / config | `rg -n "INV-ENV" docs/architecture/invariants.md` |
| new util / duplicate helper | `rg -n "INV-REUSE\|INV-SRP\|INV-SIZE" docs/architecture/invariants.md` |
| verification / closure | `rg -n "INV-VER\|Definition of Done" docs/architecture/invariants.md` |

## Ownership

| Документ | Владеет |
| --- | --- |
| [architecture/invariants.md](./architecture/invariants.md) | registry `INV-*` и Definition of Done; открывать точечно по ID |
| [architecture/README.md](./architecture/README.md) | карта runtime/API/ownership contracts и профильных runtime docs |
| [architecture/module-map.md](./architecture/module-map.md) | раскладка приложений и backend-модулей по папкам |
| [architecture/gotchas/README.md](./architecture/gotchas/README.md) | подтвержденные риски и неочевидные моменты |
| [architecture/agent-operating-model.md](./architecture/agent-operating-model.md) | контракт делегирования subagents |
| [phases/README.md](./phases/README.md) | roadmap и текущий статус фаз |
| [phases/PHASE_AUTHORING_GUIDE.md](./phases/PHASE_AUTHORING_GUIDE.md) | правила написания phase/step docs |
| [operations/README.md](./operations/README.md) | setup, deployment, Railway runbooks |
| [integrations/README.md](./integrations/README.md) | внешние интеграции (eSIM Access и др.) |
| [archive/README.md](./archive/README.md) | архив legacy-документов; недостоверны без проверки кодом |
| `docs/architecture/*` | durable technical contracts |
| `docs/phases/*` | phase contracts, step journals, rollout context |

## Supporting Layer

`docs/work`, `docs/plans`, `docs/audits`, `docs/info` — temporary/supporting context, игнорируются git (`.gitignore`). Если там найдено решение, перенести его в phase/wiki doc или оставить как черновик.

## Source of truth

При конфликте документов:

1. код и Prisma schema;
2. wiki в `docs/architecture/`;
3. runbooks в `docs/operations/`;
4. архивные документы в `docs/archive/`.

## Rules

- One fact -> one home.
- README маршрутизирует; профильный doc владеет контрактом.
- Не читать всю `docs/` подряд.
- История, планы и audits не заменяют live code и durable wiki.
