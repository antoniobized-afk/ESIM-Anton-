# Step 05 — Client Landing, AuthProvider Integration And Admin UI

> [Назад к Phase 16](../phase-16-partner-referral-links.md)

## Цель

Подключить партнёрские ссылки к пользовательскому web-flow и дать admin
интерфейс для управления ссылками и просмотра аналитики.

## Что нужно сделать

- В `client` добавить route `client/app/ref/[code]/page.tsx`.
- Landing behavior:
  - запросить `GET /referrals/links/:code/public`;
  - если ссылка invalid, показать состояние недействительной ссылки и CTA на
    каталог;
  - если valid, сохранить `pendingReferralCode` в `localStorage`;
  - показать CTA:
    - открыть Telegram: `https://t.me/<bot>?start=ref_<code>`;
    - продолжить на сайте: `/`;
  - если есть promo code, показать его и copy action.
- В `client/components/AuthProvider.tsx` добавить one-shot `useEffect`:
  - ждёт `isBootstrapped && user`;
  - читает `pendingReferralCode`;
  - вызывает `POST /referrals/register-web`;
  - после success refresh-ит `/auth/me`;
  - очищает `localStorage`;
  - не использует `storedUser?.referredById` как client-side idempotency guard.
- В `client/lib/api.ts` добавить методы:
  - public referral link info;
  - register web referral.
- В `admin/lib/api.ts` и types добавить partner referral link contracts.
- В `admin/app/(admin)/referral-links/page.tsx` добавить:
  - таблицу ссылок;
  - copy action для Telegram/Web links;
  - create/edit modal;
  - status display active/inactive/expired;
  - summary metrics: registrations, primary purchase revenue, earnings;
  - optional secondary LTV/top-up metric только отдельно от commissionable
    revenue;
  - detail stats surface или modal;
  - `payoutMode` select в create/edit форме (BALANCE / EXTERNAL);
  - столбец «Выплата» с бейджем в таблице;
  - banner в stats modal при `EXTERNAL` режиме.
- В `admin/components/AdminShell.tsx` добавить nav item `Партнёрские ссылки`.
- Следовать текущим admin UI patterns:
  - использовать существующие `Button`, `Modal`, `Toast`/local patterns;
  - не добавлять unrelated redesign;
  - не использовать `alert()`/`confirm()`.

## Результат шага

- Web users могут попасть по `/ref/<code>`, авторизоваться и быть привязанными
  через `register-web`.
- Telegram CTA продолжает вести в bot `start=ref_<code>`.
- Admin может создать, отредактировать, скопировать и проверить статистику
  партнёрской ссылки.
- Existing `/referrals` user page не ломается.

## Зависимости

- Step 04 для backend API.

## Статус

- `done`

## Журнал изменений

### 2026-05-19

- Шаг объединяет client/admin surfaces, потому что оба зависят от уже готового
  backend API и не должны диктовать domain contract.
- **Client API**: `getPublicLinkInfo`, `registerWebReferral` в `referralsApi`.
- **Client Landing** `/ref/[code]/page.tsx`: public endpoint, localStorage
  pending code, Telegram + Web CTA, promo copy action.
- **AuthProvider**: one-shot `useEffect` с ref-guard, вызывает `register-web`
  при `isBootstrapped && user`, очищает localStorage.
- **Admin types**: `AdminReferralLink`, `AdminReferralLinkStats`,
  `CreateReferralLinkDto`, `UpdateReferralLinkDto`.
- **Admin API**: `referralLinksApi` (getAll, create, update, getStats).
- **Admin page**: `ReferralLinks.tsx` — table с status badges, copy Telegram/Web
  links, create/edit Modal, stats Modal с metrics cards и referred users table.
- Follow-up hardening after audit:
  - edit PATCH contract поддерживает `null` для `promoCodeId`/`expiresAt` вместо silent `undefined`;
  - `bonusPercent` хранится строкой и валидируется до submit;
  - stats modal использует explicit open-state и request invalidation against late response.
- **Admin nav**: `Link2` icon, «Партнёрские ссылки» перед Analytics.
- Верификация: `tsc --noEmit` чист (client + admin), 25/25 backend тестов.
- Добавлен `payoutMode` в admin types (`ReferralPayoutMode`), create/update DTOs,
  таблицу (столбец «Выплата» с бейджем «На баланс»/«К выплате»),
  форму (select BALANCE/EXTERNAL с подсказкой), stats modal (banner при EXTERNAL).

## Файлы

- `client/app/ref/[code]/page.tsx`
- `client/components/AuthProvider.tsx`
- `client/lib/api.ts`
- `admin/app/(admin)/referral-links/page.tsx`
- `admin/components/AdminShell.tsx`
- `admin/lib/api.ts`
- `admin/lib/types.ts`

## Тестирование / Верификация

- `/ref/<activeCode>` сохраняет `pendingReferralCode`.
- `/ref/<expiredCode>` не сохраняет usable pending code.
- `AuthProvider` отправляет pending referral в web stored-token flow.
- `AuthProvider` отправляет pending referral в Telegram auth flow.
- После success pending code очищается и повторный page refresh не делает повторный
  request.
- Admin sidebar содержит новый пункт.
- Admin create/edit flow вызывает правильные backend endpoints.
- Copy action формирует Telegram и Web links.
- Admin revenue labels не смешивают commissionable purchase revenue и top-up/LTV.
