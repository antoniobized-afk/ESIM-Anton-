'use client'

import type { OrderQuote, Product } from '@/lib/api'
import type {
  ChargeOrderWithSavedCardResponse,
  SavedPaymentCardSummary,
} from '@shared/contracts/checkout'
import type { SavedCardFollowUpState } from './types'

export const QUICK_DAY_OPTIONS = [3, 5, 7, 14, 30]

export function getSavedCardFollowUpState(
  response: ChargeOrderWithSavedCardResponse,
): SavedCardFollowUpState | null {
  if (response.chargeState === 'ambiguous') {
    return {
      kind: 'ambiguous',
      orderId: response.order.id,
      attemptId: response.repeatChargeAttemptId ?? null,
      message:
        response.message ||
        'Платеж по привязанной карте сейчас проверяется. Не оплачивайте заказ повторно, дождитесь проверки в списке заказов.',
    }
  }

  if (response.chargeState === 'in_progress') {
    return {
      kind: 'in_progress',
      orderId: response.order.id,
      attemptId: response.repeatChargeAttemptId ?? null,
      message:
        response.message ||
        'Запрос на списание уже обрабатывается. Не запускайте оплату повторно, откройте список заказов и дождитесь обновления.',
    }
  }

  return null
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message
  if (Array.isArray(responseMessage)) {
    const message = responseMessage.filter(Boolean).join(', ')
    return message || fallback
  }
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage
  }
  return fallback
}

export function getPurchaseErrorMessage(error: unknown, fallback: string) {
  const apiMessage = getApiErrorMessage(error, '')
  if (apiMessage) return apiMessage
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

export function getQuotePromoDiscountPercent(quote: OrderQuote) {
  if (!quote.baseAmount || quote.promoDiscount <= 0) return 0
  return Math.round((quote.promoDiscount / quote.baseAmount) * 100)
}

export function getPurchaseMaxDays(product: Product | null): number {
  const validityDays = Number(product?.validityDays)
  if (!Number.isFinite(validityDays) || validityDays < 1) return 1
  return Math.max(1, Math.floor(validityDays))
}

export function clampPurchaseDays(value: unknown, maxDays: number): number {
  const days = Number(value)
  if (!Number.isInteger(days)) return 1
  return Math.min(maxDays, Math.max(1, days))
}

export function getRequestedPurchaseDays(value: string | null): number | null {
  const days = Number(value)
  return Number.isInteger(days) && days > 0 ? days : null
}

export function getSavedCardLabel(savedCard: SavedPaymentCardSummary | null) {
  if (!savedCard) return null

  return [
    savedCard.cardBrand || 'Карта',
    savedCard.cardMask,
    savedCard.expMonth && savedCard.expYear
      ? `${String(savedCard.expMonth).padStart(2, '0')}/${String(savedCard.expYear).slice(-2)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
