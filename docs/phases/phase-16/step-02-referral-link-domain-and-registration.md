# Step 02 — ReferralLink Domain And Atomic Registration

> [Назад к Phase 16](../phase-16-partner-referral-links.md)

## Цель

Добавить backend domain logic для партнёрских ссылок и unified registration flow,
не ломая существующую user-to-user referral систему.

## Что нужно сделать

- В `ReferralsService` добавить CRUD/domain methods:
  - `createReferralLink(dto)`;
  - `updateReferralLink(id, dto)`;
  - `getReferralLinks(query)`;
  - `getReferralLinkStats(id)`;
  - `getReferralLinkPublicInfo(code)`.
- Для `createReferralLink` и смены code реализовать validation:
  - `code` уникален в `ReferralLink`;
  - `code` не совпадает с `User.referralCode`;
  - `userId` существует;
  - `promoCodeId` существует, если передан;
  - `bonusPercent > 0`;
  - `bonusPercent` пишется через `Prisma.Decimal`.
- Изменить `registerReferral(userId, code, expectedTelegramId?)`:
  - проверять пользователя и Telegram identity как сейчас;
  - сначала искать `ReferralLink.code`;
  - если link active и не expired, ставить `referredById = link.userId` и
    `referralLinkId = link.id`;
  - если link inactive/expired, возвращать null без fallback;
  - если link не найден, fallback на `User.referralCode`;
  - запрещать self-referral для обоих путей.
- Финальную запись делать атомарно через conditional update:

```typescript
await prisma.user.updateMany({
  where: { id: userId, referredById: null },
  data: { referredById, referralLinkId, pendingPromoCode },
});
```

- Если `updateMany.count = 0`, не перезаписывать attribution и не выдавать
  `pendingPromoCode`.
- Сохранить immutable attribution policy:
  - уже привлечённый пользователь не получает новый partner attribution;
  - уже привлечённый пользователь не получает partner `pendingPromoCode` в V1.
- Убедиться, что bot prefix handling остаётся в bot layer:
  backend принимает чистый `code`, а не `ref_<code>`.

## Результат шага

- Existing `/start ref_<userReferralCode>` flow сохраняет поведение.
- New `/start ref_<partnerCode>` flow привязывает пользователя к владельцу
  `ReferralLink`.
- Inactive/expired partner code не может случайно fallback-нуться на user code.
- Параллельные registration calls не перезаписывают `referredById`.

## Зависимости

- Step 01.

## Статус

- `planned`

## Журнал изменений

### 2026-05-19

- Шаг выделен отдельно от API layer, чтобы сначала стабилизировать domain
  contract.

## Файлы

- `backend/src/modules/referrals/referrals.service.ts`
- `backend/src/modules/referrals/referrals.service.spec.ts`
- `backend/prisma/schema.prisma`
- `bot/src/commands/index.ts` только для smoke/reference, runtime edit не планируется

## Тестирование / Верификация

- Обычный `User.referralCode` всё ещё работает.
- Active `ReferralLink.code` ставит `referredById + referralLinkId`.
- Expired/inactive `ReferralLink.code` возвращает null и не fallback-ится.
- Self-referral запрещён.
- Два параллельных `registerReferral` не перезаписывают attribution.
- Уже привлечённый пользователь не получает `pendingPromoCode`.
