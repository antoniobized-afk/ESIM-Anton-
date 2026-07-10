# Step 06 — Admin campaign workspace и user timeline

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Дать оператору отдельный, компактный workspace для campaign links и support
timeline без смешивания с PromoCodes, ReferralLinks или mixed user API.

## Что нужно сделать

- Заменить placeholder `/analytics` на «Источники трафика» с typed URL state
  и tabs Campaigns / Attribution report / Bloggers & CPA.
- Реализовать campaign constructor/list: UTM tuple, relative target, optional
  existing referral-link picker, generated canonical URLs, copy/QR, lifecycle
  actions и backend-enforced role state.
- Использовать local QR encoder after dependency/license audit; QR encodes
  backend-returned canonical URL and is not fetched from a third party.
- Добавить separate admin-only marketing timeline endpoint/view for user detail:
  first/last and touch history; не расширять mixed `GET /users/:id`.
- Показывать linked promo/partner policy read-only и направлять mutations в
  existing PromoCodes/ReferralLinks owners.

## Результат шага

- Admin получает один operational screen для создания campaign links и их
  статуса без ручных URL/UTM ошибок.
- SUPPORT видит reports/timeline, но backend отклоняет campaign mutation;
  MANAGER/SUPER_ADMIN получают allowed controls.
- Пользовательская support карточка показывает фактическую timeline, а не
  synthetic UTM guess.
- New campaign role policy не маскирует existing broader permissions у
  PromoCodes/ReferralLinks; изменение их access contract не входит в этот
  step без отдельного approved consumer audit.

## Зависимости

- Step 02.
- Steps 03–04 для live touch/timeline data.

## Статус

`planned`

## Evidence

- Pending implementation.

## Файлы

- `admin/app/(admin)/analytics/**`
- `admin/components/marketing-attribution/**`
- `admin/components/users/UserDetailsModal.tsx`
- `admin/lib/{api,types}.ts`
- `backend/src/modules/marketing-attribution/**`
- `admin/components/AdminShell.tsx` only if navigation label requires change

## Тестирование / Верификация

- Campaign mutation/read role matrix on backend and UI mirroring.
- Generated links/QR equal backend response; inactive campaign has safe state.
- Timeline route requires admin JWT and does not leak raw visitor/TG data.
- Browser smoke for compact tabs, URL refresh/back-forward and desktop/mobile.
- Lookup: `INV-CLIENT-1`, `INV-DTO-1`, `INV-AUTH-1`, `INV-SEC-1`,
  `INV-REUSE-1`, `INV-VER-2..4`.
