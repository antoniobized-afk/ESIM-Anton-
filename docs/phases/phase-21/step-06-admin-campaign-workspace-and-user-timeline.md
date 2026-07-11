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
- Timeline и campaign association строить по canonical `userId` из marketing
  facts/snapshots. `User.telegramId` допустим только как отображаемый contact
  field, не как proof login identity или fallback для timeline lookup.
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

`completed`

## Evidence

- `/analytics` заменён на компактный workspace «Источники трафика» с
  каноническим URL-state (`tab`, `status`, `page`), campaign constructor/list,
  backend-returned web/bot/Mini App links, локальным QR и безопасным inactive
  state. SUPPORT получает read-only UI; mutation controls доступны только
  MANAGER/SUPER_ADMIN и остаются защищены backend owner.
- Optional referral picker читает существующие active `ReferralLink`
  постранично. Reward/promo policy показывается read-only, а изменение
  направляется в существующий `/referral-links` owner; новый financial contract
  не создан.
- Добавлен отдельный admin route
  `GET /marketing-attribution/users/:userId/timeline`. Read owner делает один
  bounded Prisma projection по canonical `User.id` с вложенной пагинацией и
  `_count`; response не выбирает `telegramId`, `sourceEventKey`, visitor HMAC
  или raw Telegram data. User modal показывает current first/last,
  registration snapshots и factual touch history.
- QR dependency audit: `qrcode@1.5.4` и `@types/qrcode@1.5.6`, лицензия MIT;
  QR строится локально только из canonical URL backend response.
- Post-review: lifecycle confirmation переведён на общий admin
  `useConfirmDialog`; pending mutations хранятся по campaign id, поэтому
  завершение одной операции не разблокирует другую ещё выполняющуюся mutation.
- Gates: `pnpm --filter backend build`; marketing contour — 16 suites / 84
  tests; full backend — 67 suites / 558 tests; `pnpm --filter admin lint`;
  `pnpm --filter admin build`. Consumer audit выполнен по
  `backend/admin/client/bot/shared`: новый timeline contract имеет только admin
  consumer, существующие web/client capture consumers не изменены.
- Step 08 закрыл browser gate на production builds и disposable PostgreSQL:
  SUPER_ADMIN создал campaign, получил canonical web/bot/Mini App links и
  локальный data-URL QR; desktop 1440px и mobile 390px layouts не имеют page
  overflow, dense navigation/tabs остаются горизонтально прокручиваемыми.
- User navigation теперь использует `router.push`, поэтому Campaigns → Report
  → CPA восстанавливаются через Back/Forward и после reload; `replace` оставлен
  только для canonical normalization URL. SUPPORT увидел read-only banner и
  не получил mutation controls, а прямой backend mutation вернул `403`.
- Operator hint `targetPath` исправлен на существующие client routes (`/` и
  `/country/TH`), чтобы constructor не предлагал несуществующий `/catalog`.
  Финальные admin lint/build green.

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
- Explicit Telegram link с `User.telegramId = null` остаётся корректным user
  timeline; UI не выводит отсутствие contact field как отсутствие Telegram
  identity.
- Browser smoke for compact tabs, URL refresh/back-forward and desktop/mobile.
- Lookup: `INV-CLIENT-1`, `INV-DTO-1`, `INV-AUTH-1`, `INV-SEC-1`,
  `INV-REUSE-1`, `INV-VER-2..4`.
