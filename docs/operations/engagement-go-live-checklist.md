# Engagement Go-Live Checklist

> [Корневой документ wiki](../README.md)

Сводный go-live checklist для двух денежных engagement-фич:

- `referrals`
- `loyalty`

Документ нужен как короткая финальная проверка перед выкладкой и сразу после деплоя, когда важно убедиться, что экран, checkout и post-purchase side effects не расходятся.

## Перед деплоем

- Подтвердить, что backend tests зелёные:
  - `npx jest src/modules/referrals/referrals.service.spec.ts src/modules/referrals/referrals.controller.spec.ts src/modules/loyalty/loyalty.service.spec.ts src/modules/loyalty/loyalty.controller.spec.ts src/modules/orders/orders.service.spec.ts --runInBand`
- Подтвердить, что typecheck зелёный:
  - `backend`: `npx tsc --noEmit -p tsconfig.json`
  - `client`: `npx tsc --noEmit --incremental false`
- Подтвердить, что `client` lint зелёный:
  - `npx next lint`
- Проверить env contract:
  - `TELEGRAM_BOT_USERNAME`
  - `TELEGRAM_BOT_TOKEN`
  - payment provider secrets

## После деплоя

### Web smoke

- Сделать обычный web login.
- Открыть `/referrals`.
- Открыть `/loyalty`.
- Проверить, что обе страницы грузят реальные данные, а не fallback state.

### Telegram Mini App smoke

- Открыть Mini App через реального бота.
- Проверить cold start `/referrals`.
- Проверить cold start `/loyalty`.
- Если auth bootstrap не удался, убедиться, что UI показывает explicit Telegram auth-required state, а не generic load error.

### Referral runtime

- Открыть partner Telegram referral link c `startapp=ref_<partnerCode>` для нового пользователя.
- Проверить, что после auth bootstrap registration проходит один раз.
- Проверить обычный user-to-user bot flow: `/start ref_<userCode>`.
- Дополнительно проверить partner bot fallback: `/start ref_<partnerCode>`.
- Повторить и убедиться, что anti-rebind не даёт перепривязать пользователя.
- Проверить `GET /referrals/me`:
  - `referralLink`
  - `referralPercent`
  - `enabled`
  - `minPayout`

### Loyalty runtime

- Проверить `GET /loyalty/me` через экран `/loyalty`:
  - current level
  - current discount
  - current cashback
  - next level threshold
  - progress to next level
- Из админки изменить threshold/discount/cashback одного уровня.
- Проверить, что `/loyalty` и следующий checkout показывают и применяют одинаковые benefit-ы.
- Удалить промежуточный уровень и проверить, что пользователи сразу reassigned без ожидания следующей покупки.

### Checkout and bonus integrity

- Сделать покупку с cashback-only bonus.
- Сделать покупку с referral bonus ниже `minPayout`.
- Сделать покупку с referral bonus выше `minPayout`.
- Проверить, что checkout discount loyalty соответствует уровню, который показывает `/loyalty`.
- Проверить, что cashback начисляется после успешной покупки по pre-purchase level.
- Проверить, что следующая покупка использует уже новый loyalty level после роста `totalSpent`.

### Exclusions and failures

- Провести top-up заказ.
- Проверить, что top-up:
  - не меняет `totalSpent`
  - не начисляет cashback
  - не меняет `loyaltyLevel`
  - не создаёт referral award
- Провести незавершённую card payment.
- Проверить, что bonus hold не остаётся навсегда и stale hold cleanup работает.

### Awarding and replay safety

- Завершить оплаченный заказ реферала.
- Проверить, что рефереру начисляется один `REFERRAL_BONUS`.
- Проверить replay/duplicate callback: второго начисления быть не должно.

## Что мониторить

- `401/403` на `GET /referrals/me`
- `401/403` на `GET /loyalty/me`
- `401/403` на `POST /referrals/register` для bot flow
- расхождение между `/loyalty` и фактическим pricing/cashback в checkout
- повторные `REFERRAL_BONUS` по одному `orderId`
- зависшие `PENDING` orders и bonus holds после неуспешной оплаты
