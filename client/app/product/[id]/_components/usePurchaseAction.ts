'use client'

import { useCallback } from 'react'
import { ordersApi, paymentsApi, type Product } from '@/lib/api'
import { isTelegramWebApp } from '@/lib/auth'
import { payCloudPayments } from '@/lib/cloudpayments'
import type { PurchaseStage } from '@/components/PurchaseOverlay'
import type { CreateOrderRequest, SavedPaymentCardSummary } from '@shared/contracts/checkout'
import { getPurchaseErrorMessage, getSavedCardFollowUpState } from './checkout-helpers'
import type { ProductPaymentMethod, SavedCardFollowUpState } from './types'

type CheckoutUser = {
  id: string
  email?: string | null
}

type ProductRouter = {
  push: (href: string) => void
}

interface UsePurchaseActionParams {
  authToken: string | null
  authUser: CheckoutUser | null
  balance: number | null
  email: string
  isDaily: boolean
  payableTotal: number
  paymentMethod: ProductPaymentMethod
  product: Product | null
  promoApplied: boolean
  promoCode: string
  purchaseDays: number
  router: ProductRouter
  savedCard: SavedPaymentCardSummary | null
  setPurchaseError: (value: string) => void
  setPurchaseStage: (value: PurchaseStage | null) => void
  setPurchasing: (value: boolean) => void
  setSavedCard: (value: SavedPaymentCardSummary | null) => void
  setSavedCardFollowUp: (value: SavedCardFollowUpState | null) => void
}

export function usePurchaseAction({
  authToken,
  authUser,
  balance,
  email,
  isDaily,
  payableTotal,
  paymentMethod,
  product,
  promoApplied,
  promoCode,
  purchaseDays,
  router,
  savedCard,
  setPurchaseError,
  setPurchaseStage,
  setPurchasing,
  setSavedCard,
  setSavedCardFollowUp,
}: UsePurchaseActionParams) {
  return useCallback(async (methodOverride?: 'balance' | 'card') => {
    if (!product) return

    const method = methodOverride ?? paymentMethod
    const buildProductReturnTo = (options?: { autoBuy?: boolean }) => {
      const url = new URL(window.location.href)
      if (isDaily) {
        url.searchParams.set('days', String(purchaseDays))
      } else {
        url.searchParams.delete('days')
      }
      if (options?.autoBuy) url.searchParams.set('autoBuy', '1')
      return `${url.pathname}${url.search}${url.hash}`
    }

    setPurchasing(true)
    setPurchaseStage('creating')
    setPurchaseError('')
    setSavedCardFollowUp(null)

    try {
      const { getToken } = await import('@/lib/auth')
      let user: CheckoutUser | null = authUser

      if (!user) {
        const token = authToken || getToken()
        if (token) {
          const { api } = await import('@/lib/api')
          const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          user = data
        } else {
          router.push(`/login?returnTo=${encodeURIComponent(buildProductReturnTo())}`)
          return
        }
      }

      if (!user) throw new Error('Пользователь не найден')

      const userEmail = email.trim() || user.email || ''
      const buildCreatePayload = (orderPaymentMethod: 'balance' | 'card') => {
        const payload: CreateOrderRequest = { productId: product.id, quantity: 1 }
        if (orderPaymentMethod === 'balance') payload.paymentMethod = 'balance'
        if (isDaily && purchaseDays > 1) payload.periodNum = purchaseDays
        if (promoApplied && promoCode.trim()) payload.promoCode = promoCode.trim()
        if (userEmail) payload.email = userEmail
        return payload
      }

      const tg = isTelegramWebApp() ? (window as any).Telegram.WebApp : null
      const finishSuccessfulPurchase = async (message: string, orderId: string) => {
        if (tg) {
          tg.showAlert(message, () => router.push(`/order/${orderId}`))
        } else {
          alert(message)
          router.push(`/order/${orderId}`)
        }
      }
      const openWidgetForOrder = async (orderForWidget: { id: string; totalAmount: number }) => {
        setPurchaseStage(null)

        const result = await payCloudPayments({
          publicId: process.env.NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID || '',
          description: `Mojo mobile заказ #${orderForWidget.id.slice(-8)}`,
          amount: Number(orderForWidget.totalAmount ?? payableTotal),
          currency: 'RUB',
          invoiceId: orderForWidget.id,
          accountId: user.id,
          email: userEmail || undefined,
          data: { purpose: 'esim_order' },
          saveCard: true,
        })

        if (result.success) {
          await finishSuccessfulPurchase('Оплата принята. Проверяем выпуск eSIM…', orderForWidget.id)
        } else {
          console.error('Payment failed:', result.reason)
          if (tg) tg.showAlert('Оплата не прошла. Попробуйте еще раз.')
          else alert('Оплата не прошла. Попробуйте еще раз.')
        }
      }

      if (method === 'balance' && payableTotal > 0) {
        const userBalance = Number(balance ?? 0)
        if (userBalance < payableTotal) {
          const need = Math.ceil(payableTotal - userBalance)
          const returnTo = buildProductReturnTo({ autoBuy: true })
          router.push(`/balance?topup=${need}&returnTo=${encodeURIComponent(returnTo)}`)
          return
        }

        setPurchaseStage('paying')
        await ordersApi.create(buildCreatePayload('balance'))

        setPurchaseStage('done')
        await new Promise(r => setTimeout(r, 1200))

        if (tg) {
          tg.showAlert('eSIM выдана! Открываю «Мои eSIM»…', () => router.push('/my-esim'))
        } else {
          router.push('/my-esim')
        }
        return
      }

      setPurchaseStage('creating')
      const createResult = await ordersApi.create(buildCreatePayload('card'))
      const order = createResult.order

      const orderTotal = Number(order.totalAmount ?? payableTotal)

      if (orderTotal <= 0) {
        setPurchaseStage('provisioning')
        const { api: apiClient } = await import('@/lib/api')
        await apiClient.post(`/orders/${order.id}/fulfill-free`)

        setPurchaseStage('done')
        await new Promise(r => setTimeout(r, 1200))

        if (tg) {
          tg.showAlert('eSIM активирована! Промокод применён.', () => router.push('/my-esim'))
        } else {
          router.push('/my-esim')
        }
        return
      }

      if (method === 'saved_card' && savedCard) {
        setPurchaseStage('paying')
        const repeatCharge = await paymentsApi.chargeOrderWithSavedCard(order.id)

        if (repeatCharge.success) {
          setSavedCard(repeatCharge.savedCard)
          await finishSuccessfulPurchase(
            repeatCharge.message || 'Оплата принята. Проверяем выпуск eSIM…',
            order.id,
          )
          return
        }

        setSavedCard(repeatCharge.savedCard)

        const followUp = getSavedCardFollowUpState(repeatCharge)
        if (followUp) {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(
              'mojo_pending_saved_card_order_id',
              followUp.orderId,
            )
          }
          setPurchaseStage(null)
          setSavedCardFollowUp(followUp)
          return
        }

        if (repeatCharge.fallbackToWidget) {
          if (tg) {
            tg.showAlert(
              repeatCharge.message || 'Не удалось списать с привязанной карты. Откроем оплату новой картой.',
            )
          } else {
            alert(
              repeatCharge.message || 'Не удалось списать с привязанной карты. Откроем оплату новой картой.',
            )
          }

          setPurchaseStage('creating')
          const widgetFallback = await ordersApi.create(buildCreatePayload('card'))
          const fallbackOrder = widgetFallback.order
          const fallbackTotal = Number(fallbackOrder.totalAmount ?? payableTotal)

          if (fallbackTotal <= 0) {
            setPurchaseStage('provisioning')
            const { api: apiClient } = await import('@/lib/api')
            await apiClient.post(`/orders/${fallbackOrder.id}/fulfill-free`)
            setPurchaseStage('done')
            await new Promise(r => setTimeout(r, 1200))
            if (tg) {
              tg.showAlert('eSIM активирована! Промокод применён.', () => router.push('/my-esim'))
            } else {
              router.push('/my-esim')
            }
            return
          }

          await openWidgetForOrder(fallbackOrder)
          return
        }

        throw new Error(
          repeatCharge.message || 'Не удалось списать с привязанной карты',
        )
      }

      await openWidgetForOrder({ id: order.id, totalAmount: orderTotal })
    } catch (error) {
      console.error('Ошибка создания заказа:', error)
      setPurchaseStage('error')
      setPurchaseError(getPurchaseErrorMessage(error, 'Ошибка при создании заказа'))
    } finally {
      setPurchasing(false)
    }
  }, [
    authToken,
    authUser,
    balance,
    email,
    isDaily,
    payableTotal,
    paymentMethod,
    product,
    promoApplied,
    promoCode,
    purchaseDays,
    router,
    savedCard,
    setPurchaseError,
    setPurchaseStage,
    setPurchasing,
    setSavedCard,
    setSavedCardFollowUp,
  ])
}
