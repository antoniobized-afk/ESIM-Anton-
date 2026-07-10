# Step 04 — Telegram bot и Mini App trusted capture

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Подключить Telegram campaign links без untrusted `initDataUnsafe`, payload
collision с `ref_` и двойного capture между bot/Mini App paths.

## Что нужно сделать

- Ввести `ma_` parser namespace и отдельные generated links для bot `start` и
  Mini App `startapp`; соблюдать Telegram 64-character URL-safe limit.
- Изменить bot entry ordering так, чтобы campaign payload доступен до
  find-or-create decision; убрать redundant second registration call, если
  current session user уже есть.
- Добавить bot-only capture endpoint под `ServiceTokenGuard`, который сверяет
  canonical Telegram/user relation and produces idempotent event.
- Existing Mini App auth request already передаёт raw `initData`; извлечь из
  него `start_param` только внутри backend WebApp verification, после HMAC и
  `auth_date` freshness. В `AuthProvider` не добавлять отдельную передачу raw
  `start_param`: auth flow передаёт marketing owner уже verified launch intent.
- Сохранить `ref_` referral parser и existing bot/user identity behavior.

## Результат шага

- `start=ma_…` и `startapp=ma_…` independently capture one trusted touch.
- Replay/duplicate update не создаёт duplicate touch/referral side effect.
- Для `ma_` client-provided `initDataUnsafe.start_param` не является source of
  truth; `startapp=ma_…` из validated `initData` действительно доходит до
  capture. Existing `ref_` parser сохраняет свой отдельный flow.
- Existing `ref_` link и bot signup не регрессируют.

## Зависимости

- Step 02.

## Статус

`planned`

## Evidence

- Pending implementation.

## Файлы

- `bot/src/{index,api,commands}/**`
- `backend/src/modules/{auth,users}/**`
- `backend/src/modules/marketing-attribution/**`

## Тестирование / Верификация

- Bot start for a new/existing user; same update retry; `ref_` regression.
- Valid/invalid/expired WebApp `initData`; `startapp=ma_…` must be extracted
  server-side and create capture, while `initDataUnsafe`/query-only imitation
  must not. The test fixture includes a signed `start_param` to prove delivery,
  not only parser behavior.
- Service-token endpoint rejects absent/wrong token and mismatched Telegram user.
- `pnpm --filter bot build` и affected backend gates; Mini App delivery
  подтверждается signed `initData` fixture и manual smoke, без изменения client
  implementation в этом step.
- Lookup: `INV-DTO-1`, `INV-TYPE-1`, `INV-AUTH-1`, `INV-SEC-1`,
  `INV-CLIENT-2`, `INV-VER-2..4`.
