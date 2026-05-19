# Referral Production Checklist

> [Корневой документ wiki](../README.md)

Короткий checklist для rollout и post-deploy smoke referral-модуля.

## Перед деплоем

- Подтвердить, что `backend` tests зелёные:
  - `npx jest src/modules/referrals/referrals.service.spec.ts src/modules/referrals/referrals.controller.spec.ts src/modules/orders/orders.service.spec.ts --runInBand`
- Подтвердить, что typecheck зелёный:
  - `backend`: `npx tsc --noEmit -p tsconfig.json`
  - `client`: `npx tsc --noEmit --incremental false`
- Подтвердить, что `client` lint зелёный:
  - `npx next lint`
- Проверить runtime env contract:
  - `TELEGRAM_BOT_USERNAME`
  - `TELEGRAM_BOT_TOKEN`
  - CloudPayments public/private credentials

## После деплоя

### Web smoke

- Выполнить обычный web login.
- Открыть `/referrals`.
- Проверить, что страница грузит реальные данные через `GET /referrals/me`.
- Проверить `referralLink`, `referralPercent`, `enabled`, `minPayout`.

### Telegram Mini App smoke

- Открыть Mini App через реального бота.
- Проверить cold start `/referrals`.
- Если auth bootstrap не завершён, убедиться, что UI показывает явное Telegram auth-required состояние, а не generic data-load error.

### Referral registration

- Открыть partner Telegram referral link c `startapp=ref_<partnerCode>` для нового пользователя.
- Проверить, что после auth bootstrap registration проходит один раз.
- Проверить обычный user-to-user bot flow: `/start ref_<userCode>`.
- Дополнительно проверить partner bot fallback: `/start ref_<partnerCode>`.
- Повторить сценарий и убедиться, что anti-rebind не даёт перепривязать пользователя.

### Payment and bonus integrity

- Провести покупку только с cashback bonus.
- Провести покупку с referral bonus ниже `minPayout`.
- Провести покупку с referral bonus выше `minPayout`.
- Провести незавершённую card payment и убедиться, что bonus hold не остаётся навсегда.
- После истечения stale hold проверить, что повторная попытка покупки создаёт новый корректный hold.

### Awarding

- Завершить оплаченный заказ реферала.
- Проверить, что рефереру начислен один `REFERRAL_BONUS`.
- Проверить повторный payment callback/replay: второго начисления быть не должно.

## Что мониторить

- `401/403` на `GET /referrals/me`
- `401/403` на `POST /referrals/register` для bot flow
- зависшие `PENDING` orders после неуспешной card payment
- повторные `REFERRAL_BONUS` по одному и тому же `orderId`
