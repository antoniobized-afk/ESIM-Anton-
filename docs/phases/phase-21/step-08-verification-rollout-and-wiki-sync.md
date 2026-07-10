# Step 08 — Cross-surface verification, rollout и wiki sync

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Доказать end-to-end contract и оставить runtime/wiki evidence, пригодные для
следующей сессии без повторного reverse engineering.

## Что нужно сделать

- Провести migration preflight/apply plan and rollout-boundary verification.
- Пройти web, bot `start`, Mini App `startapp`, referral/promo/order/report/
  export/manual admin scenarios.
- Выполнить backend/client/admin/bot targeted gates and consumer audit.
- Обновить `module-map.md` after live module lands, relevant auth/referral docs
  при фактическом contract change, phase status/evidence и roadmap lifecycle.
- Distinguish product failure from infra/harness issues; do not claim historical
  report coverage before rollout timestamp.

## Результат шага

- Phase has one demonstrable source-to-CPA path and no unverified migration or
  cross-client contract.
- Docs name real owners, operational limits and rollout start boundary.
- Status is `completed` only after all phase gates and manual scenario pass.

## Зависимости

- Steps 02–07.

## Статус

`planned`

## Evidence

- Pending implementation.

## Файлы

- `docs/architecture/{marketing-attribution-runtime,module-map,README}.md`
- `docs/architecture/{auth-identity-runtime,referrals-runtime,promo-codes-runtime}.md` when implementation changes their live contract
- `docs/phases/phase-21*`
- affected backend/admin/client/bot specs

## Тестирование / Верификация

- `pnpm --filter backend build` plus targeted backend tests and Prisma validate.
- Touched `client`/`admin` lint + build; `pnpm --filter bot build`.
- Browser/manual: generated web link, bot start, Mini App startapp, linked
  referral, manual partner promo override, primary order, top-up exclusion,
  report first/last, CPA export and role denial.
- Identity regression: existing account с explicit `TELEGRAM` identity и
  `User.telegramId = null` проходит Mini App `startapp` и linked-referral flow;
  чужая identity или non-null contact drift отклоняются до touch/referral/reward
  write.
- `git diff --check`, markdown link check and consumer audit across backend,
  admin, client, bot and shared.
- Lookup: `INV-VER-1..4`, `INV-DOC-1`, `INV-REUSE-1`, `INV-SRP-1`,
  `INV-SIZE-1`.
