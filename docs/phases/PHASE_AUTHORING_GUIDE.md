[⬅️ Назад к плану фаз](README.md)

# Phase Authoring Guide

Стандарт создания `phase-N-*.md` и `phase-N/step-XX-*.md`.

Этот файл владеет только формой phase/step artifacts. Runtime/API/DoD правила брать через Risk Lookup во входном [../README.md](../README.md).

## Workflow

1. Сверить roadmap/status в [README.md](./README.md).
2. Создать phase doc из [phase-template.md](./templates/phase-template.md) на русском языке, без смешивания с другими языками.
3. Заполнить цель, результат, зависимости, decisions, verification и links.
4. Разбить фазу на 3-8 шагов.
5. Создать директорию `phase-N/` и planned step files из [step-template.md](./templates/step-template.md) для каждого шага со статусом `planned`.
6. В phase doc поставить ссылки на все step files в `Шаги`.
7. Добавить phase в roadmap только после синхронизации ссылок и статуса. Черновик без step files не считать готовым phase contract.
8. Зафиксировать durable contract change в профильной wiki до implementation (Architecture Gate).
9. После каждого step обновлять step file status/evidence и phase status snapshot.
10. При closure пройти DoD через Risk Lookup `verification / closure`, обновить phase status/evidence, перенести фазу в `COMPLETED_PHASES.md` и убрать её строку из `README.md`.
11. Если на любом шаге появился architecture/runtime/verification риск, открыть только нужный `INV-*` через Risk Lookup в [../README.md](../README.md).

Архив завершённых фаз: [COMPLETED_PHASES.md](./COMPLETED_PHASES.md). Фазы, написанные до этого стандарта, не переделывать ретроактивно; новый стандарт обязателен для новых фаз и для closure текущих.

## When To Create A Phase

Фаза нужна, если работа:

- закрывает законченный product/runtime slice;
- делится на 3-8 проверяемых задач-шагов;
- имеет зависимости, decisions и verification gate;
- требует координации нескольких surfaces (`backend`/`admin`/`client`/`bot`) или phase-level status/evidence snapshot.

Не создавать фазу для мелкой правки, unrelated cleanup, спорной идеи без решения или задачи шире 8 шагов. Мелкое вести через `task.md` / PR; широкое разбивать на несколько фаз.

## Artifact Set

Полноценная фаза в roadmap состоит из:

1. `docs/phases/phase-N-name.md` — phase contract.
2. `docs/phases/phase-N/step-XX-name.md` — task/evidence file для каждого шага.
3. `docs/phases/README.md` или `COMPLETED_PHASES.md` — статус фазы.

## Document Ownership

Глобальный layer ownership принадлежит [../README.md](../README.md). Здесь только ownership phase artifacts.

| Документ               | Владеет                                                                                                    | Не владеет                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `phase-N-*.md`         | цель, результат, scope, decisions, список шагов со ссылками, phase verification, status/evidence snapshot  | step diff, длинные логи, runtime tutorial  |
| `phase-N/step-XX-*.md` | задача шага, planned/active/closed scope, actual result, deviations, touched surfaces, verification evidence | phase summary, копия wiki                  |
| `task.md`              | execution DAG текущей сессии                                                                               | durable decisions                          |

Если факт уже живёт во внешнем source-of-truth doc, ставить ссылку и назначение, не копировать текст.

## Phase File Contract

Phase document должен содержать:

1. `Цель` — один product/runtime outcome.
2. `Результат` — что появится в системе.
3. `Оценка` — size, число шагов, главные риски. *(transient: удаляется при closure)*
4. `Зависит от` и `Пререквизиты`. *(transient: сжимается до 1-2 строк при closure)*
5. `Архитектурные решения` — phase-specific decisions и ссылки на профильные wiki docs.
6. `Шаги` — ссылки на все step files.
7. `Верификация` — phase-level flow/evidence plan, без копии DoD. *(transient: удаляется при closure)*
8. `Связанные документы` — только ссылки и зачем читать.
9. `Статус / Evidence` — текущий статус, текущий шаг, последние gates и ссылки на wiki без хронологического журнала.

Optional: `Execution topology` — добавлять только если фаза нелинейная, затрагивает 3+ surfaces/модулей или содержит шаги с неочевидными зависимостями. Блок описывает порядок шагов и gates, а не план запуска воркеров: default workflow — **одна сессия берёт один step**. Если реально нужен bounded subagent handoff, фиксировать его в конкретном step file через `Agent handoff`, а не в parent phase doc. *(transient: удаляется при closure)*

## Step File Contract

Step file создаётся вместе с phase doc в статусе `planned`. По мере реализации этот же файл становится evidence snapshot для шага.

Step file должен содержать:

1. `Цель`.
2. `Что нужно сделать`.
3. `Результат шага` — acceptance criteria с binary pass/fail проверкой каждого условия.
4. `Зависимости`.
5. `Статус`: `planned | in_progress | partial | baseline | completed`.
6. `Evidence`.
7. `Файлы`.
8. `Тестирование / Верификация`.

Optional: `Не входит в scope` — что явно исключено, чтобы предотвратить scope creep. Удалять, если scope очевиден.

Optional: `Agent handoff` — только когда subagent получает bounded scope, `Write set`, `Do not touch` и gate по [agent-operating-model.md](../architecture/agent-operating-model.md). Main agent владеет phase closure verdict.

## Step Decomposition

Хороший шаг:

- атомарен по смыслу;
- проверяется отдельно;
- описывает что и зачем, а не как — оставляет свободу реализации в рамках паттернов проекта;
- даёт демонстрируемый результат — после выполнения можно показать или проверить конкретный outcome;
- зависит максимум от 1-3 предыдущих шагов;
- имеет понятный owner surface: `backend`, `admin`, `client`, `bot`, data, docs или verification;
- может быть отдельным implementation pass.

Если шаг требует исследования перед реализацией (unknown provider API, неясный scope, выбор подхода), разбить его на discovery (spike) + implementation. Spike — time-boxed шаг с `Результат шага` = конкретное решение или ответ, не код.

Плохой шаг: "backend stuff", "UI часть", "рефакторинг", "подключить всё", микрошаг ради одного field/button.

Зависимости указывать только реальные. Не строить линейную цепочку "на всякий случай".

## Writing And Closure Rules

Содержание:

- Phase doc описывает target contract фазы, а не историю каждого commit.
- Step file сначала фиксирует задачу шага, затем current evidence/deviation/gates.
- Phase doc не ведёт хронологический журнал: только текущий статус и ссылки на step evidence / wiki.
- Durable contract change сначала попадает в профильный source-of-truth doc, найденный через entrypoint/Risk Lookup; phase только ссылается на него.
- Supporting materials (`docs/work`, `docs/plans`, `docs/audits`) использовать как входные данные после re-baseline с live code; они не становятся truth.
- Длинные logs, file diff, пересказ wiki, копии DoD и test matrix не вставлять.
- Placeholder text из шаблона заменять конкретикой; не оставлять обучающие подсказки в финальном phase/step doc.
- Если шаблон конфликтует с этим guide или architecture wiki, править шаблон, а не копировать конфликт дальше.

Closure:

- `completed` разрешён только после DoD; открывать через Risk Lookup `verification / closure`.
- Перед `completed` по implementation-step пройти responsibility/reuse closure через Risk Lookup `new local pattern` и `new util / duplicate helper`.
- Known mixed responsibility, copy-paste и "разрежем позже" не допускаются как residual risk при closure.
- Если step дал только `partial` или `baseline`, так и писать; не закрывать как `completed`.
- Если step породил structural debt, статус шага — `partial` или `blocked` до исправления в этом же scope.
- В step file писать gate, result, manual flow/evidence и consumer audit при смене contract.
- Если step обновил durable wiki doc, ссылаться на него; не копировать решение в phase/step.
- Phase `✅ Завершена` только после сквозного E2E/manual scenario через все шаги.
- Infra/harness failure записывать отдельно от product result (`INV-VER-3`).

## Optional Coordination Blocks

Минимальный состав `Execution topology`:

- рабочее правило: одна сессия берёт один step и обновляет step evidence + phase status snapshot;
- critical path / DAG шагов;
- шаги, которые независимы по предметной области, но выполняются отдельными сессиями;
- gates/evidence, открывающие следующий step.

Не указывать model matrix, worker roles, write-set таблицы или global delegation policy в parent phase doc. Если пользователь явно просит параллельных агентов или step реально отдаётся subagent'у, handoff живёт в соответствующем step file и следует [agent-operating-model.md](../architecture/agent-operating-model.md).

## Anti-Patterns

- **Documentation lie:** статус говорит `completed`, а runtime path/evidence отсутствуют.
- **Missing step files:** phase есть в roadmap, но `phase-N/step-XX-*.md` не созданы.
- **Copy flood:** один факт повторён в нескольких слоях вместо ссылки на source-of-truth.
- **Phase as tutorial:** phase doc объясняет архитектуру вместо ссылки на профильный doc.
- **Topology bureaucracy:** agent/table блок добавлен для маленькой линейной задачи.
- **Changelog dump:** phase/step превращается в полный diff или test log.
- **Compatibility language leak:** obsolete/transitional mode остаётся в target-state docs.
- **Acceptable-for-now debt:** step закрыт `completed` с известным SRP/file-size/duplicate-code долгом.
- **Blind utility creation:** новый helper/service создан без `rg`-аудита существующих owners и похожих helpers.

## Completed Phase Lifecycle

Когда фаза получает статус `✅ Завершена`, её документация сжимается до completed-summary формата. Цель: завершённая фаза отвечает на 3 вопроса за 30 секунд — что достигнуто, какие решения приняты, где детали.

### Completed-summary формат phase doc

Завершённая фаза содержит только:

1. `Цель` — 1-2 предложения.
2. `Результат` — bullet list ключевых deliverables.
3. `Архитектурные решения` — только решения, влияющие на последующий код. Если решение уже зафиксировано в профильной wiki — только ссылка и однострочное пояснение. Максимум 5-10 пунктов.
4. `Шаги` — однострочные ссылки на step files без деталей execution.
5. `Связанные документы` — ссылки на профильные docs.
6. `Статус` — `✅ Завершена`.

### Что удаляется при сжатии

- `Журнал` — хронология процесса разработки.
- `Оценка` (size/risks) — не актуально для завершённого.
- `Верификация` — gates пройдены, evidence зафиксировано в step files.
- `Execution topology` — не нужно после завершения.
- Inline архитектурные спецификации (Prisma DDL, HTTP contract, guard rules) — переносятся в профильную wiki, phase оставляет ссылку.
- Verbose `Пререквизиты` и `Зависит от` — сжимаются до 1-2 строк.
- Артефакты процесса (audit inputs, implementation gates, target contracts, которые уже живут в wiki).

### Step files завершённых фаз

Step files сохраняются для трассируемости, но не сжимаются при phase closure. Они служат evidence snapshot и не требуют ретроактивной чистки.

### Процедура сжатия

1. Перенести inline contracts/specs в профильную wiki (если ещё не там).
2. Сжать phase doc до completed-summary формата.
3. Убедиться, что фаза есть в `COMPLETED_PHASES.md`, а её строка убрана из `README.md`.
4. Не трогать step files и не ломать обратные ссылки из них.

## Quality Bar

Хорошая фаза позволяет новой сессии за 1-2 минуты понять:

- зачем нужна фаза;
- где её границы;
- какие decisions уже приняты;
- какие step files выполнять и в каком порядке;
- какие gates доказывают completion.

Если документ требует читать много вторичных материалов до понимания сути, он раздут. Если после чтения нужно угадывать contract или tasks, он недописан.

Хорошая **завершённая** фаза позволяет за 30 секунд понять, что было достигнуто, какие решения влияют на текущую работу и где искать детали. Всё остальное — bloat.
