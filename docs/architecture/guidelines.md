# Guidelines

> [Корневой документ wiki](../README.md)

## Как читать проект

- Начинать с `docs/README.md`, затем `docs/architecture/system-overview.md`.
- Любое утверждение из корневых markdown-файлов перепроверять по коду.

## Что считать архитектурным baseline

- Backend — модульный NestJS monolith.
- `admin`, `client`, `bot` — разные клиенты над одним API.
- Prisma schema и controller/service код важнее старых чеклистов и summary-документов.

## Как обновлять wiki дальше

- При добавлении backend-модуля обновлять `module-map.md`.
- При изменении платежного, auth или provider flow обновлять `system-overview.md` и профильный runtime doc (`payment-flow-audit.md`, `auth-identity-runtime.md` и т.п.).
- При нахождении нового расхождения между legacy docs и кодом добавлять запись в профильный файл в `gotchas/`.
- Нормативные code-level правила фиксировать как `INV-*` в `invariants.md`, а не дублировать текстом по docs.

## Client App Router

- Для крупных route-level client pages держать `page.tsx` тонким координатором: route flags, загрузочный skeleton, orchestration handlers и сборка секций.
- Route-private хуки и презентационные компоненты размещать рядом в `app/<route>/_components`, если они не переиспользуются за пределами route segment.
- API/data flow, localStorage preferences и UI секции не смешивать в одном компоненте; пример baseline — `client/app/profile/page.tsx` после SRP refactor.

## Что не делать

- Не ссылаться на корневые документы как на source of truth без явной пометки `legacy`.
- Не документировать production readiness, если это не подтверждено кодом и реальной верификацией.
