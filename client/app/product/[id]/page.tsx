'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import BackHeader from '@/components/BackHeader'
import { productsApi, Product, userApi, ordersApi, promoApi, paymentsApi, type OrderQuote } from '@/lib/api'
import { isTelegramWebApp } from '@/lib/auth'
import { getCountryName } from '@/lib/utils'
import { PurchaseOverlay, type PurchaseStage } from '@/components/PurchaseOverlay'
import { getCoverageSummary } from '@/lib/productCoverage'
import { useAuth } from '@/components/AuthProvider'
import { sanitizeRedirect } from '@/lib/security'
import { payCloudPayments } from '@/lib/cloudpayments'
import type {
  ChargeOrderWithSavedCardResponse,
  SavedPaymentCardSummary,
} from '@shared/contracts/checkout'
import { isClientDailyProduct } from '@/lib/productDataType'
import {
  DaysSelector,
  EsimCompatibilityNotice,
  NotesCard,
  OrderSummaryCard,
  ProductHeaderCard,
} from './_components/ProductPlanSections'
import {
  AgreementsCard,
  EmailCard,
  PaymentMethodCard,
  PricingSummaryCard,
  PromoCodeCard,
  PurchaseCta,
  SavedCardFollowUpCard,
  type PaymentMethod,
  type SavedCardFollowUpState,
} from './_components/ProductCheckoutSections'

function getSavedCardFollowUpState(
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

function getApiErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as any)?.response?.data?.message
  if (Array.isArray(responseMessage)) {
    const message = responseMessage.filter(Boolean).join(', ')
    return message || fallback
  }
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage
  }
  return fallback
}

function getQuotePromoDiscountPercent(quote: OrderQuote) {
  if (!quote.baseAmount || quote.promoDiscount <= 0) return 0
  return Math.round((quote.promoDiscount / quote.baseAmount) * 100)
}

export default function ProductPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ProductPageInner />
    </Suspense>
  )
}

function ProductPageInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user: authUser, token: authToken, isLoading: authLoading } = useAuth()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseStage, setPurchaseStage] = useState<PurchaseStage | null>(null)
  const [purchaseError, setPurchaseError] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [promoApplied, setPromoApplied] = useState(false)
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [pricingQuote, setPricingQuote] = useState<OrderQuote | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingError, setPricingError] = useState('')
  const [selectedDays, setSelectedDays] = useState(7)
  const [email, setEmail] = useState('')
  const [emailSaved, setEmailSaved] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
  const [savedCard, setSavedCard] = useState<SavedPaymentCardSummary | null>(null)
  const [savedCardFollowUp, setSavedCardFollowUp] = useState<SavedCardFollowUpState | null>(null)
  const [agreedEsim, setAgreedEsim] = useState(false)
  const [agreedOnlyInternet, setAgreedOnlyInternet] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  // autoBuy=1 — пользователь вернулся с /balance после успешного пополнения,
  // нужно сразу запустить покупку с баланса. Гард не даёт вызвать дважды.
  const autoBuyTriggeredRef = useRef(false)

  const isDaily = product ? isClientDailyProduct(product) : false
  const maxSelectableDays = product && isDaily ? Math.max(1, Number(product.validityDays) || 1) : 1
  const effectiveSelectedDays = isDaily ? Math.min(selectedDays, maxSelectableDays) : selectedDays
  const basePrice = product ? (isDaily ? product.ourPrice * effectiveSelectedDays : product.ourPrice) : 0
  const estimatedPromoDiscount = promoApplied ? Math.round(basePrice * promoDiscount / 100) : 0
  const estimatedTotalPrice = basePrice - estimatedPromoDiscount
  const promoDiscountAmount = pricingQuote?.promoDiscount ?? estimatedPromoDiscount
  const loyaltyDiscountAmount = pricingQuote?.loyaltyDiscount ?? 0
  const payableTotal = pricingQuote?.totalAmount ?? estimatedTotalPrice
  const quotePromoCode = pricingQuote?.promoCode?.trim() || null
  const effectivePromoCode = quotePromoCode
  const serverPromoStatus = pricingQuote?.promoStatus ?? 'none'
  const serverPromoMessage = pricingQuote?.promoMessage ?? null
  const manualPromoActive = promoApplied && Boolean(promoCode.trim())
  const autoPromoActive =
    pricingQuote?.promoCodeSource === 'REFERRAL_LINK_AUTO' &&
    serverPromoStatus === 'applied' &&
    Boolean(quotePromoCode && promoDiscountAmount > 0 && !manualPromoActive)
  const autoPromoUnavailable =
    serverPromoStatus === 'unavailable' &&
    Boolean(pricingQuote?.hasReferralAttribution) &&
    !manualPromoActive
  const hasAnyPromoDiscount = Boolean(quotePromoCode && promoDiscountAmount > 0)
  const displayedBasePrice = pricingQuote?.baseAmount ?? basePrice
  const isReferralPurchase = Boolean(pricingQuote?.hasReferralAttribution)
  const hasPricingContext = Boolean(authUser?.id || authToken)
  const pricingResolved = !hasPricingContext || Boolean(pricingQuote)
  const pricingPending = hasPricingContext && (pricingLoading || !pricingResolved)
  const coverageSummary = product ? getCoverageSummary(product) : ''
  const safeReturnTo = sanitizeRedirect(searchParams.get('returnTo'), '')

  useEffect(() => {
    if (!product || !isDaily) return
    setSelectedDays((days) => Math.min(maxSelectableDays, Math.max(1, days)))
  }, [isDaily, maxSelectableDays, product])

  useEffect(() => {
    if (authUser?.email && !email) {
      setEmail(authUser.email)
      setEmailSaved(true)
    }
  }, [authUser, email])

  // Загружаем актуальный баланс пользователя для тоггла «С баланса / Картой».
  useEffect(() => {
    let cancelled = false
    const loadBalance = async () => {
      if (!authUser?.id) {
        if (!cancelled) setBalance(0)
        return
      }
      try {
        const profile = await userApi.getProfile(authUser.id)
        if (!cancelled) setBalance(Number(profile.balance) || 0)
      } catch {
        if (!cancelled) setBalance(0)
      }
    }
    loadBalance()
    return () => {
      cancelled = true
    }
  }, [authUser?.id])

  useEffect(() => {
    let cancelled = false

    const loadSavedCard = async () => {
      if (authLoading) return
      if (!authUser?.id && !authToken) {
        if (!cancelled) setSavedCard(null)
        return
      }

      try {
        const card = await paymentsApi.getActiveSavedCard()
        if (!cancelled) {
          setSavedCard(card)
        }
      } catch {
        if (!cancelled) {
          setSavedCard(null)
        }
      }
    }

    void loadSavedCard()

    return () => {
      cancelled = true
    }
  }, [authLoading, authToken, authUser?.id])

  // Если баланса хватает, по умолчанию выбираем оплату с баланса (один клик
  // вместо открытия виджета). Если не хватает — оставляем «Картой».
  useEffect(() => {
    if (payableTotal <= 0) {
      setPaymentMethod('card')
      return
    }

    if (balance !== null && balance >= payableTotal) {
      setPaymentMethod('balance')
    } else if (savedCard) {
      setPaymentMethod('saved_card')
    } else {
      setPaymentMethod('card')
    }
  }, [balance, payableTotal, savedCard])

  useEffect(() => {
    let cancelled = false

    const loadQuote = async () => {
      if (!product) {
        if (!cancelled) {
          setPricingQuote(null)
          setPricingError('')
          setPricingLoading(false)
        }
        return
      }

      if (authLoading) return

      if (!authUser?.id && !authToken) {
        if (!cancelled) {
          setPricingQuote(null)
          setPricingError('')
          setPricingLoading(false)
        }
        return
      }

      setPricingLoading(true)
      if (!cancelled) {
        setPricingError('')
      }
      try {
        const quote = await ordersApi.quote({
          productId: product.id,
          quantity: 1,
          ...(isDaily && effectiveSelectedDays > 1 ? { periodNum: effectiveSelectedDays } : {}),
          ...(promoApplied && promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
        })
        if (!cancelled) {
          setPricingQuote(quote)
          setPricingError('')
        }
      } catch (error) {
        if (!cancelled) {
          const message = getApiErrorMessage(
            error,
            'Не удалось подтвердить итоговую стоимость. Обновите страницу или попробуйте ещё раз.',
          )
          setPricingQuote(null)
          setPricingError(message)
          if (promoApplied && promoCode.trim()) {
            setPromoApplied(false)
            setPromoDiscount(0)
            setPromoError(message)
          }
        }
      } finally {
        if (!cancelled) {
          setPricingLoading(false)
        }
      }
    }

    void loadQuote()

    return () => {
      cancelled = true
    }
  }, [authLoading, authToken, authUser?.id, effectiveSelectedDays, isDaily, product, promoApplied, promoCode])

  const loadProduct = useCallback(async () => {
    try {
      const data = await productsApi.getById(params.id as string)
      setProduct(data)
      setLoading(false)
    } catch (error) {
      console.error('Ошибка загрузки:', error)
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void loadProduct()
  }, [loadProduct])

  const handleBack = () => {
    if (safeReturnTo) {
      router.push(safeReturnTo)
      return
    }

    if (product?.country) {
      router.push(`/country/${encodeURIComponent(product.country)}`)
      return
    }

    router.push('/')
  }

  /**
   * Покупка тарифа.
   *
   * Поведение зависит от `methodOverride`/`paymentMethod`:
   *  - `'balance'` && баланса хватает → POST /orders {paymentMethod:'balance'},
   *    бэк атомарно списывает и сразу выдаёт eSIM, мы редиректим в /my-esim;
   *  - `'balance'` && баланса не хватает → редирект в /balance с auto-topup
   *    на нужную разницу и `returnTo` обратно сюда с `autoBuy=1`;
   *  - `'card'` → текущий CloudPayments-flow с PENDING заказом и виджетом.
   */
  const handlePurchase = async (methodOverride?: 'balance' | 'card') => {
    if (!product) return

    const method = methodOverride ?? paymentMethod

    setPurchasing(true)
    setPurchaseStage('creating')
    setPurchaseError('')
    setSavedCardFollowUp(null)

    try {
      const { getToken } = await import('@/lib/auth')
      let user: any = authUser

      if (!user) {
        const token = authToken || getToken()
        if (token) {
          const { api } = await import('@/lib/api')
          const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          user = data
        } else {
          router.push(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`)
          return
        }
      }

      if (!user) throw new Error('Пользователь не найден')

      const userEmail = email.trim() || user.email || ''
      const buildCreatePayload = (method: 'balance' | 'card') => {
        const payload: any = { productId: product.id, quantity: 1 }
        if (method === 'balance') payload.paymentMethod = 'balance'
        if (isDaily && effectiveSelectedDays > 1) payload.periodNum = effectiveSelectedDays
        if (promoApplied && promoCode.trim()) payload.promoCode = promoCode.trim()
        if (userEmail) payload.email = userEmail
        return payload
      }
      // email передаётся в payload заказа — контроллер сохранит его синхронно

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

      // === Ветка «Покупка с баланса» ===
      if (method === 'balance' && payableTotal > 0) {
        const userBalance = Number(balance ?? 0)
        // Если баланса не хватает — редирект на /balance с auto-topup и returnTo
        if (userBalance < payableTotal) {
          const need = Math.ceil(payableTotal - userBalance)
          const currentUrl = window.location.pathname + window.location.search
          // autoBuy=1 в returnTo — после возврата автоматически вызовем покупку
          const sep = currentUrl.includes('?') ? '&' : '?'
          const returnTo = `${currentUrl}${sep}autoBuy=1`
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

      // === Ветка «Картой» — всегда создаём новый order с актуальным pricing snapshot ===
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

    } catch (error: any) {
      console.error('Ошибка создания заказа:', error);
      const errorMsg = error?.response?.data?.message || error.message || 'Ошибка при создании заказа';
      setPurchaseStage('error')
      setPurchaseError(errorMsg)
    } finally {
      setPurchasing(false);
    }
  }

  // Блокируем закрытие вкладки, пока идёт покупка
  useEffect(() => {
    if (!purchaseStage || purchaseStage === 'error' || purchaseStage === 'done') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [purchaseStage])

  // Авто-докупка после возврата с /balance: дождёмся загрузки product+balance,
  // удостоверимся что баланса теперь хватает, и один раз дёрнем покупку.
  useEffect(() => {
    if (autoBuyTriggeredRef.current) return
    if (searchParams.get('autoBuy') !== '1') return
    if (!product || balance === null) return
    if (payableTotal <= 0 || balance < payableTotal) return

    autoBuyTriggeredRef.current = true
    void handlePurchase('balance')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, balance, payableTotal, searchParams])

  const savedCardLabel = savedCard
    ? [
        savedCard.cardBrand || 'Карта',
        savedCard.cardMask,
        savedCard.expMonth && savedCard.expYear
          ? `${String(savedCard.expMonth).padStart(2, '0')}/${String(savedCard.expYear).slice(-2)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const handlePromoCodeChange = (value: string) => {
    setPromoCode(value)
    setPromoApplied(false)
    setPromoDiscount(0)
    setPromoError('')
  }

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return

    setPromoLoading(true)
    setPromoError('')
    try {
      const normalizedPromoCode = promoCode.trim()
      if (product && (authUser?.id || authToken)) {
        const quote = await ordersApi.quote({
          productId: product.id,
          quantity: 1,
          ...(isDaily && effectiveSelectedDays > 1 ? { periodNum: effectiveSelectedDays } : {}),
          promoCode: normalizedPromoCode,
        })
        setPricingQuote(quote)
        setPricingError('')
        setPromoApplied(true)
        setPromoDiscount(getQuotePromoDiscountPercent(quote))
        return
      }

      const res = await promoApi.validate(normalizedPromoCode)
      setPromoApplied(true)
      setPromoDiscount(res.discountPercent)
    } catch (error) {
      const message = getApiErrorMessage(error, 'Промокод не найден')
      setPromoApplied(false)
      setPromoDiscount(0)
      setPricingError('')
      setPromoError(message)
    } finally {
      setPromoLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="glass-card mb-6">
          <div className="skeleton w-20 h-20 rounded-2xl mx-auto mb-4" />
          <div className="skeleton h-6 w-32 mx-auto mb-2" />
          <div className="skeleton h-4 w-48 mx-auto" />
        </div>
        <div className="glass-card">
          <div className="skeleton h-8 w-24 mb-4" />
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="container">
        <div className="glass-card text-center py-12">
          <p className="text-secondary text-lg">Продукт не найден</p>
          <button onClick={handleBack} className="glass-button mt-4">
            Вернуться
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-32">
      <BackHeader
        title={getCountryName(product.country)}
        onBack={handleBack}
      />

      <ProductHeaderCard product={product} />

      <OrderSummaryCard
        coverageSummary={coverageSummary}
        displayedBasePrice={displayedBasePrice}
        isDaily={isDaily}
        product={product}
        selectedDays={effectiveSelectedDays}
      />

      <NotesCard product={product} />

      <EsimCompatibilityNotice />

      {isDaily && (
        <DaysSelector maxDays={maxSelectableDays} selectedDays={effectiveSelectedDays} onChange={setSelectedDays} />
      )}

      <PromoCodeCard
        autoPromoActive={autoPromoActive}
        autoPromoUnavailable={autoPromoUnavailable}
        effectivePromoCode={effectivePromoCode}
        hasReferralPurchase={isReferralPurchase}
        manualPromoActive={manualPromoActive}
        onApplyPromo={handleApplyPromo}
        onPromoCodeChange={handlePromoCodeChange}
        promoApplied={promoApplied}
        promoCode={promoCode}
        promoDiscount={promoDiscount}
        promoDiscountAmount={promoDiscountAmount}
        promoError={promoError}
        promoLoading={promoLoading}
        quotePromoCode={quotePromoCode}
        serverPromoMessage={serverPromoMessage}
      />

      <PricingSummaryCard
        displayedBasePrice={displayedBasePrice}
        effectivePromoCode={effectivePromoCode}
        hasAnyPromoDiscount={hasAnyPromoDiscount}
        isReferralPurchase={isReferralPurchase}
        loyaltyDiscountAmount={loyaltyDiscountAmount}
        manualPromoActive={manualPromoActive}
        payableTotal={payableTotal}
        pricingError={pricingError}
        pricingPending={pricingPending}
        promoCode={promoCode}
        promoDiscount={promoDiscount}
        promoDiscountAmount={promoDiscountAmount}
        quotePromoCode={quotePromoCode}
      />

      <EmailCard
        email={email}
        emailSaved={emailSaved}
        onEmailChange={(nextEmail) => {
          setEmail(nextEmail)
          setEmailSaved(false)
        }}
      />

      <PaymentMethodCard
        balance={balance}
        onPaymentMethodChange={setPaymentMethod}
        payableTotal={payableTotal}
        paymentMethod={paymentMethod}
        savedCard={savedCard}
        savedCardLabel={savedCardLabel}
      />

      {savedCardFollowUp && (
        <SavedCardFollowUpCard
          followUp={savedCardFollowUp}
          onOpenOrder={(orderId) => router.push(`/order/${orderId}`)}
          onOpenOrders={() => router.push('/orders')}
        />
      )}

      <AgreementsCard
        agreedEsim={agreedEsim}
        agreedOnlyInternet={agreedOnlyInternet}
        agreedTerms={agreedTerms}
        onAgreedEsimChange={setAgreedEsim}
        onAgreedOnlyInternetChange={setAgreedOnlyInternet}
        onAgreedTermsChange={setAgreedTerms}
      />

      <PurchaseCta
        agreedEsim={agreedEsim}
        agreedOnlyInternet={agreedOnlyInternet}
        agreedTerms={agreedTerms}
        balance={balance}
        onPurchase={() => handlePurchase()}
        payableTotal={payableTotal}
        paymentMethod={paymentMethod}
        pricingError={pricingError}
        pricingPending={pricingPending}
        purchasing={purchasing}
      />

      {/* Purchase progress overlay */}
      <PurchaseOverlay
        stage={purchaseStage}
        errorMessage={purchaseError}
        onClose={() => { setPurchaseStage(null); setPurchaseError(''); }}
      />
    </div>
  )
}
