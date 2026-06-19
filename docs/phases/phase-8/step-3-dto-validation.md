# Шаг 3. DTO с class-validator для external write endpoints

> [⬅️ Назад к фазе](../phase-8-api-security-infrastructure.md)

## Цель

Заменить `@Body() dto: any` и небезопасные inline body contracts на типизированные DTO с `class-validator`, чтобы глобальный `ValidationPipe(whitelist: true, forbidNonWhitelisted: true)` реально фильтровал поля.

Это самый регрессионный шаг всей фазы. Его нельзя делать массовой заменой без поэтапной проверки фактических payload-ов из `admin`, `client` и `bot`.

## Порядок внедрения

### Wave A. Auth и admin-mutation surfaces

- `auth/register-admin`, `auth/login`, `auth/phone/send-code`, `auth/phone/verify`, `auth/telegram-webapp`.
- `products` admin mutations.
- `system-settings`.

### Wave B. User write surfaces

- `users` mutations.
- `orders` create/topup/free flows.
- `payments/create` и `balance-topup`.

### Wave C. Bot/internal payloads

- `users/find-or-create`.
- `referrals/register`.

После каждой wave нужен smoke соответствующего caller'а. Нельзя переходить к следующей wave, если текущая вернула неожиданные `400`.

## Что нужно сделать

### 3.1 DTO для admin registration

- Создать `backend/src/modules/auth/dto/create-admin.dto.ts`:

```typescript
import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { AdminRole } from '@prisma/client';

export class CreateAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional() @IsString()
  firstName?: string;

  @IsOptional() @IsString()
  lastName?: string;

  @IsOptional() @IsEnum(AdminRole)
  role?: AdminRole;
}
```

- Обновить `auth.controller.ts`: заменить `@Body() dto: any` на `@Body() dto: CreateAdminDto`.

### 3.2 DTO для products create/update

- Создать `backend/src/modules/products/dto/create-product.dto.ts`:

```typescript
import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, Min } from 'class-validator';

export class CreateProductDto {
  @IsString() country: string;
  @IsString() name: string;
  @IsString() dataAmount: string;
  @IsNumber() @Min(1) validityDays: number;
  @IsNumber() @Min(0) providerPrice: number;
  @IsNumber() @Min(0) ourPrice: number;
  @IsString() providerId: string;

  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() duration?: number;
  @IsOptional() @IsString() speed?: string;
  @IsOptional() @IsString() providerName?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isUnlimited?: boolean;
  @IsOptional() @IsString() badge?: string;
  @IsOptional() @IsString() badgeColor?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() supportTopup?: boolean;
}
```

- Создать `backend/src/modules/products/dto/update-product.dto.ts`:

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
export class UpdateProductDto extends PartialType(CreateProductDto) {}
```

- Обновить `products.controller.ts`: заменить `@Body() createDto: any` / `@Body() updateDto: any`.

### 3.2.1 DTO для product bulk/admin mutations

- Создать DTO для bulk endpoints:
  - `BulkToggleActiveDto`: `ids: string[]`, `isActive: boolean`.
  - `BulkToggleByTypeDto`: `tariffType: 'standard' | 'unlimited'`, `isActive: boolean`.
  - `BulkSetBadgeDto`: `ids: string[]`, `badge?: string | null`, `badgeColor?: string | null`.
  - `BulkSetMarkupDto`: `ids: string[]`, `markupPercent: number`, ограничить `0..1000` или бизнес-лимитом.
- Все `ids` валидировать как non-empty string array.
- Не принимать unknown fields: `forbidNonWhitelisted` должен вернуть `400`.

### 3.3 DTO для system-settings

- Создать `backend/src/modules/system-settings/dto/update-pricing.dto.ts`:

```typescript
import { IsNumber, Min } from 'class-validator';

export class UpdatePricingDto {
  @IsNumber() @Min(0) exchangeRate: number;
  @IsNumber() @Min(0) defaultMarkupPercent: number;
}
```

- Создать `backend/src/modules/system-settings/dto/update-referral-settings.dto.ts`:

```typescript
import { IsNumber, IsBoolean, Min, Max } from 'class-validator';

export class UpdateReferralSettingsDto {
  @IsNumber() @Min(0) @Max(100) bonusPercent: number;
  @IsNumber() @Min(0) minPayout: number;
  @IsBoolean() enabled: boolean;
}
```

- Обновить `system-settings.controller.ts`: заменить inline `@Body()` типы на DTO.

### 3.4 DTO для auth/user-facing mutations

- `auth/dto/login-admin.dto.ts`: `email`, `password`.
- `auth/dto/send-phone-code.dto.ts`: `phone`.
- `auth/dto/verify-phone-code.dto.ts`: `phone`, `code`.
- `auth/dto/telegram-webapp-auth.dto.ts`: `initData`.
- Для phone/code DTO зафиксировать, принимаются ли значения строго строками или сейчас где-то приходят mixed formats; если frontend шлёт numbers/trimmed strings несимметрично, DTO должны отражать реальный contract.
- `users/dto/update-my-email.dto.ts`: `email`.
- `users/dto/find-or-create-user.dto.ts`: `telegramId`, optional profile/utm fields; используется вместе с service-token guard.
- `users/dto/push-subscription.dto.ts`: `endpoint`, `p256dh`, `auth`.
- `users/dto/push-unsubscribe.dto.ts`: `endpoint`.

### 3.5 DTO для orders/payments user mutations

- `orders/dto/create-order.dto.ts`: `productId`, optional `quantity`, `useBonuses`, `periodNum`, `promoCode`, `paymentMethod`.
- `orders/dto/create-topup-order.dto.ts`: `packageCode`, optional `paymentMethod`.
- `payments/dto/create-payment.dto.ts`: `orderId`.
- `payments/dto/create-balance-topup.dto.ts`: `amount`, optional `provider`.
- Для money fields использовать `@Type(() => Number)`, `@IsNumber()`, `@Min(0)`; для quantities — integer/min constraints.
- До внедрения DTO проверить, какие поля реально шлёт `client` в card flow и free/promo flow, чтобы не сломать существующий checkout из-за несовпадения optional fields.

### 3.6 Webhook payloads

- CloudPayments и Robokassa webhook bodies могут оставаться `any`/provider-specific raw payloads, потому что подпись/HMAC и provider parser являются primary validation.
- Не применять strict DTO к webhook raw body так, чтобы сломать signature verification или provider callback compatibility.

### 3.7 Явные ограничения шага

- Не переписывать service layer только ради DTO.
- Не делать "идеальные" схемы, если они конфликтуют с уже существующим runtime contract без миграционного плана.
- Не смешивать DTO rollout с throttling или CORS fixes в одном deploy, если нужна быстрая локализация регрессии.

## Результат шага

- Все external write endpoints валидируют входные данные через `class-validator`, кроме provider webhooks, где primary control — signature/HMAC parser.
- `whitelist: true` отсекает неизвестные поля (mass assignment prevention).
- Некорректные данные → `400 Bad Request` с описанием ошибок.
- Реальные `admin/client/bot` callers подтверждены smoke'ом и не ломаются на новых validation rules.

## Статус

Не начато

## Журнал изменений

(будет заполнено при реализации)

## Файлы

- `backend/src/modules/auth/dto/create-admin.dto.ts` [NEW]
- `backend/src/modules/auth/auth.controller.ts` [MODIFY]
- `backend/src/modules/products/dto/create-product.dto.ts` [NEW]
- `backend/src/modules/products/dto/update-product.dto.ts` [NEW]
- `backend/src/modules/products/dto/bulk-product.dto.ts` [NEW]
- `backend/src/modules/products/products.controller.ts` [MODIFY]
- `backend/src/modules/system-settings/dto/update-pricing.dto.ts` [NEW]
- `backend/src/modules/system-settings/dto/update-referral-settings.dto.ts` [NEW]
- `backend/src/modules/system-settings/system-settings.controller.ts` [MODIFY]
- `backend/src/modules/auth/dto/*.dto.ts` [NEW/MODIFY]
- `backend/src/modules/users/dto/*.dto.ts` [NEW]
- `backend/src/modules/orders/dto/*.dto.ts` [NEW]
- `backend/src/modules/payments/dto/*.dto.ts` [NEW]

## Тестирование / Верификация

- `POST /api/auth/register-admin` с `{ email: "not-an-email" }` → `400` с ошибкой `email must be an email`.
- `POST /api/auth/register-admin` с `{ email: "a@b.com", password: "123" }` → `400` с ошибкой `password must be longer than or equal to 8 characters`.
- `POST /api/products` с `{ country: "RU", name: "Test", extraField: "hack" }` → `400` из-за `forbidNonWhitelisted`.
- `POST /api/products/bulk/toggle-active` с пустым `ids` → `400`.
- `POST /api/system-settings/pricing` с `{ exchangeRate: -5 }` → `400`.
- `POST /api/payments/create` без `orderId` → `400`.
- `POST /api/orders` без `productId` → `400`.
- `POST /api/auth/phone/send-code` без `phone` → `400`.
- CloudPayments webhook с валидной подписью не ломается из-за DTO validation.
- `npm run build` — без ошибок.
- Manual smoke:
  - admin create/update product и system-settings mutations;
  - client login, `/orders`, checkout card path и free/promo path;
  - bot `find-or-create` и `referrals/register`.
