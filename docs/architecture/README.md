# Architecture Wiki Index

> [Корневой документ wiki](../README.md)

> Source of truth по устройству системы на текущем репозитории.
> Основано на проверке кода в `backend/`, `admin/`, `client/`, `bot/`, `shared/` и архивных markdown-файлов.

## Читать в таком порядке

1. [system-overview.md](./system-overview.md)
   Короткая карта продукта, рантаймов и главных интеграций.
2. [module-map.md](./module-map.md)
   Детальная раскладка приложений, backend-модулей и ownership по папкам.

## Поддерживающие документы

- [gotchas/README.md](./gotchas/README.md) — подтвержденные риски и неочевидные моменты проекта.
- [guidelines.md](./guidelines.md) — локальные правила, которые уже диктует кодовая база.
- [loyalty-runtime.md](./loyalty-runtime.md) — актуальный runtime-контракт системы лояльности.
- [payment-flow-audit.md](./payment-flow-audit.md) — целостная карта payment lifecycle, pricing contract и checkout/top-up/balance вариаций.
- [promo-codes-runtime.md](./promo-codes-runtime.md) — текущий runtime-контракт промокодов и policy lock для Phase 17 Partner Promo Codes.
- [referrals-runtime.md](./referrals-runtime.md) — актуальный runtime-контракт referral flow после referral follow-up.
- [auth-identity-runtime.md](./auth-identity-runtime.md) — текущий auth/account contract и целевая граница `User` vs `UserIdentity` для Phase 18.
- [telegram-broadcast-runtime.md](./telegram-broadcast-runtime.md) — planned runtime-контракт Telegram broadcast campaigns для Phase 19: contact boundary, queue semantics, rate limits и error taxonomy.

## Правило source of truth

При конфликте источников приоритет такой:

1. Код и схема Prisma.
2. Эта wiki в `docs/architecture/`.
3. Operations runbooks в `docs/operations/`.
4. Архивные legacy-документы в `docs/archive/`.

Архивные документы нельзя считать достоверными без проверки через код: они описывают несколько разных эпох проекта.
