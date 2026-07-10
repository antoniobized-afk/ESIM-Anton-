# Agent Operating Model

> [Корневой документ wiki](../README.md)

Координационный контракт для multi-agent работы. Открывать перед первым запуском subagent.

## Контракт

- Главный агент сам читает source-of-truth docs; маршрут владеется `docs/README.md`.
- Главный агент владеет архитектурой, финальным patch, выбором verification gate и финальной интерпретацией результатов проверок.
- Subagents — опциональные помощники для bounded recon, больших `rg`/лог-срезов, consumer audit, повторных checks, review или disjoint implementation scope.
- Не делегировать блокирующие архитектурные решения, phase closure strategy или глобальную политику делегирования.
- Каждый subagent получает bounded scope и ожидаемый формат ответа; явные
  `model`/`effort` задаются только когда текущая сигнатура spawn их поддерживает.
- Subagent не редактирует вне assigned scope и не создаёт overlapping contracts.

## Когда делегировать

- `rg`, inventory, лог-срезы и запуск назначенных checks — cheapest sufficient model (Haiku/Sonnet).
- Bounded recon, consumer audit, review и failure triage — делегировать для сбора фактов; архитектурный вывод, рискованный review и сложную диагностику оставлять главному агенту или повышать модель.
- Disjoint implementation — повышать модель только при clear scope и непересекающихся файлах.
- Architecture/debug synthesis остаётся у главного агента.

## Перед запуском subagent

1. Понятен critical path задачи.
2. Subtask имеет узкий scope и ожидаемый формат ответа.
3. При доступном model override выбирать cheapest sufficient; не наследовать дорогую модель для простой задачи.
4. Subagent явно запрещено принимать архитектурные решения, если это не назначено.
5. Результат subagent — сырьё для главного агента, а не готовое решение: факты перепроверяются по указанным источникам перед применением.
6. Если текущая сигнатура spawn поддерживает explicit `model`/`effort`, не
   совмещать override с full-history fork (`fork_context: true` или
   `fork_turns: "all"`): запускать без полного fork либо без override. Если
   параметров нет в сигнатуре, не имитировать выбор модели текстом задачи и
   явно сообщить об ограничении.

## Phases и Verification

- Для large phase work использовать декомпозицию из phase doc (`docs/phases/*`), если она есть.
- `task.md` может отражать live execution status, но не является source of truth.
- Verification gates владеются `INV-VER-*` в [invariants.md](./invariants.md); subagent может выполнить назначенные команды, но результат интерпретирует главный агент.
