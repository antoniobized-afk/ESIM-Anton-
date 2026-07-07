'use client'

export type ProductPaymentMethod = 'balance' | 'card' | 'saved_card'

export type SavedCardFollowUpState = {
  kind: 'ambiguous' | 'in_progress'
  orderId: string
  attemptId: string | null
  message: string
}
