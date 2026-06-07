import type { AdminOrder, OrderStatus } from '@/lib/types'

export const CANCELLABLE = new Set<OrderStatus>(['PENDING', 'FAILED'])
export const RETRYABLE = new Set<OrderStatus>(['PAID'])
export const PENDING_PAID_RECOVERY = 'pending_paid_recovery'
export const RECONCILE_FINALIZABLE = new Set([
  'issued_but_finalize_failed',
  'topup_issued_but_finalize_failed',
])

export const RECONCILIATION_TEXT: Record<string, string> = {
  pending_paid_recovery: 'Оплата есть, заказ ещё pending',
  webhook_acked_fulfillment_pending: 'Оплата принята, ждёт выдачу',
  stuck_processing: 'Завис в обработке',
  provider_failed_after_card_charge: 'Провайдер упал после оплаты',
  provider_failed_balance_refunded: 'Провайдер упал, баланс возвращён',
  topup_failed_balance_refunded: 'Top-up упал, баланс возвращён',
  repeat_charge_ambiguous: 'Неясный итог оплаты картой',
  issued_but_finalize_failed: 'eSIM выдана, нужна финализация',
  topup_issued_but_finalize_failed: 'Top-up выдан, нужна финализация',
}

export const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'PENDING', label: 'Ожидает оплаты' },
  { value: 'PAID', label: 'Оплачен' },
  { value: 'PROCESSING', label: 'В обработке' },
  { value: 'COMPLETED', label: 'Выполнен' },
  { value: 'FAILED', label: 'Ошибка' },
  { value: 'CANCELLED', label: 'Отменен' },
  { value: 'REFUNDED', label: 'Возврат' },
] as const

export const STATUS_TEXT: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]),
)

export const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  PAID: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-purple-100 text-purple-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-700',
  REFUNDED: 'bg-gray-100 text-gray-700',
}

export function formatOrderPrice(value: unknown): string {
  return `₽${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`
}

export function hasOrderDiscount(order: AdminOrder): boolean {
  return (
    Number(order.promoDiscount || 0) > 0 ||
    Number(order.discount || 0) > 0 ||
    Number(order.bonusUsed || 0) > 0
  )
}

export function getReconciliationText(order: AdminOrder): string | null {
  const category = order.reconciliation?.category
  if (!order.reconciliation?.needsAttention || !category) return null
  return RECONCILIATION_TEXT[category] || category
}

export function getOrderActionAvailability(order: AdminOrder) {
  return {
    canRetryFulfillment: RETRYABLE.has(order.status),
    canRecoverPaidPending:
      order.status === 'PENDING' &&
      order.reconciliation?.category === PENDING_PAID_RECOVERY,
    canFulfillFree:
      order.status === 'PENDING' &&
      Number(order.totalAmount || 0) <= 0,
    canFinalizeReconcile:
      order.status === 'PROCESSING' &&
      RECONCILE_FINALIZABLE.has(order.reconciliation?.category || ''),
    canCancel: CANCELLABLE.has(order.status),
  }
}
