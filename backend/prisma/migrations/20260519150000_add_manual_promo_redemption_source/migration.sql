-- Расширяем durable promo redemption lifecycle на manual promo path.
-- Это убирает race по maxUses и исключает premature usedCount increment до создания заказа.

ALTER TYPE "PromoCodeRedemptionSource" ADD VALUE IF NOT EXISTS 'MANUAL';
