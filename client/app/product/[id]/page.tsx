'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Wifi, Clock, Tag, CreditCard, Mail, Wallet } from '@/components/icons'
import BackHeader from '@/components/BackHeader'
import { MapPin, Smartphone, Ban } from 'lucide-react'
import { productsApi, Product, userApi, ordersApi, promoApi, paymentsApi, type OrderQuote } from '@/lib/api'
import { isTelegramWebApp } from '@/lib/auth'
import { formatPrice, formatDataAmount, getFlagUrl, getCountryName } from '@/lib/utils'
import { PurchaseOverlay, type PurchaseStage } from '@/components/PurchaseOverlay'
import { getCoverageSummary } from '@/lib/productCoverage'
import { useAuth } from '@/components/AuthProvider'
import { sanitizeRedirect } from '@/lib/security'
import { payCloudPayments } from '@/lib/cloudpayments'
import type {
  ChargeOrderWithSavedCardResponse,
  SavedPaymentCardSummary,
} from '@shared/contracts/checkout'

type SavedCardFollowUpState = {
  kind: 'ambiguous' | 'in_progress'
  orderId: string
  attemptId: string | null
  message: string
}

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
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'card' | 'saved_card'>('card')
  const [savedCard, setSavedCard] = useState<SavedPaymentCardSummary | null>(null)
  const [savedCardFollowUp, setSavedCardFollowUp] = useState<SavedCardFollowUpState | null>(null)
  const [agreedEsim, setAgreedEsim] = useState(false)
  const [agreedOnlyInternet, setAgreedOnlyInternet] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  // autoBuy=1 — пользователь вернулся с /balance после успешного пополнения,
  // нужно сразу запустить покупку с баланса. Гард не даёт вызвать дважды.
  const autoBuyTriggeredRef = useRef(false)

  const isDaily = product?.isUnlimited
  const basePrice = isDaily ? product.ourPrice * selectedDays : product?.ourPrice ?? 0
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
          ...(isDaily && selectedDays > 1 ? { periodNum: selectedDays } : {}),
          ...(promoApplied && promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
        })
        if (!cancelled) {
          setPricingQuote(quote)
          setPricingError('')
        }
      } catch {
        if (!cancelled) {
          setPricingQuote(null)
          setPricingError('Не удалось подтвердить итоговую стоимость. Обновите страницу или попробуйте ещё раз.')
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
  }, [authLoading, authToken, authUser?.id, isDaily, product, promoApplied, promoCode, selectedDays])

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
        if (isDaily && selectedDays > 1) payload.periodNum = selectedDays
        if (promoApplied && promoCode.trim()) payload.promoCode = promoCode.trim()
        if (userEmail) payload.email = userEmail
        return payload
      }
      if (userEmail && !user.email) {
        try {
          const { api: apiClient } = await import('@/lib/api')
          const token = authToken || (await import('@/lib/auth')).getToken()
          await apiClient.patch('/users/me/email', { email: userEmail }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          })
        } catch { /* non-critical */ }
      }

      const tg = isTelegramWebApp() ? (window as any).Telegram.WebApp : null
      const finishSuccessfulPurchase = async (message: string) => {
        if (tg) {
          tg.showAlert(message, () => router.push('/my-esim'))
        } else {
          alert(message)
          router.push('/my-esim')
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
          await finishSuccessfulPurchase('Оплата прошла успешно!')
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
            repeatCharge.message || 'Оплата по привязанной карте прошла успешно!',
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

      {/* Compact Product Header */}
      <div className="card-neutral p-4 mb-4 animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center border border-gray-100">
            {getFlagUrl(product.country) ? (
              <img
                src={getFlagUrl(product.country)}
                alt={getCountryName(product.country)}
                className="w-10 h-auto rounded object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = '/logo-mark.png'; (e.target as HTMLImageElement).className = 'w-9 h-9 rounded-lg object-contain'; }}
              />
            ) : (
              <img src="/logo-mark.png" alt="Mojo mobile" className="w-9 h-9 rounded-lg object-contain" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-primary leading-tight truncate">{getCountryName(product.country)}</h1>
            <p className="text-sm text-secondary truncate">{product.name}</p>
            <p className="text-sm text-gray-500 mt-2 leading-snug">
              {product.isUnlimited
                ? 'Лимит обновляется каждый день в течение выбранного периода.'
                : 'Весь объём можно использовать в любой день до окончания срока.'}
            </p>
          </div>
        </div>
      </div>

      {/* Order summary */}
      <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
          <div className="flex items-center gap-2 text-secondary">
            <Wifi size={16} />
            <span className="text-sm">Трафик</span>
          </div>
          <span className="font-semibold text-primary">
            {formatDataAmount(product.dataAmount)}{isDaily ? ' / день' : ''}
          </span>
        </div>
        <div className={`flex items-center justify-between py-2 ${!isDaily ? 'border-b border-gray-100 dark:border-gray-800/50' : 'border-b border-gray-100 dark:border-gray-800/50'}`}>
          <div className="flex items-center gap-2 text-secondary">
            <Clock size={16} />
            <span className="text-sm">Срок действия</span>
          </div>
          <span className="font-semibold text-primary">
            {isDaily ? `${selectedDays} дней` : `${product.validityDays} дней`}
          </span>
        </div>
        {isDaily && (
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
            <div className="flex items-center gap-2 text-secondary">
              <Tag size={16} />
              <span className="text-sm">Цена за день</span>
            </div>
            <span className="font-semibold text-primary">₽{formatPrice(product.ourPrice)}</span>
          </div>
        )}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2 text-secondary">
            <MapPin size={16} />
            <span className="text-sm">Где работает</span>
          </div>
          <span className="font-semibold text-primary text-right max-w-[60%]">{coverageSummary}</span>
        </div>
        <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100 dark:border-gray-800/50">
          <span className="text-sm font-medium text-secondary">Базовая стоимость тарифа</span>
          <p className="text-lg font-bold text-primary">₽{formatPrice(displayedBasePrice)}</p>
        </div>
      </div>

      {/* Примечание из админки */}
      {(() => {
        const tags = product.tags ?? []
        if (tags.length === 0 && !product.notes) return null
        return (
          <div className="card-neutral p-4 mb-4 animate-slide-up bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/30" style={{ animationDelay: '0.11s' }}>
            <p className="text-xs uppercase tracking-wide text-yellow-700 dark:text-yellow-500 mb-1">Примечание</p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {product.notes && (
              <p className="text-sm text-yellow-900 dark:text-yellow-400 whitespace-pre-line">{product.notes}</p>
            )}
          </div>
        )
      })()}

      {/* Info block */}
      <div className="card-neutral p-4 mb-4 animate-slide-up bg-orange-50/70 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30" style={{ animationDelay: '0.12s' }}>
        <div className="flex items-start gap-3 mb-3">
          <Smartphone size={20} className="text-orange-700 dark:text-orange-500 shrink-0 mt-0.5" />
          <span className="text-sm text-orange-900 dark:text-orange-400">
            Только интернет. Звонки и СМС недоступны.
          </span>
        </div>
        <div className="flex items-start gap-3">
          <Ban size={20} className="text-orange-700 dark:text-orange-500 shrink-0 mt-0.5" />
          <span className="text-sm text-orange-900 dark:text-orange-400">
            Не подходит для регистрации в сервисах (WhatsApp, Telegram и др.)
          </span>
        </div>
      </div>

      {/* Days selector for unlimited/daily plans */}
      {isDaily && (
        <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.12s' }}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Количество дней</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedDays(d => Math.max(1, d - 1))}
              className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={365}
              value={selectedDays}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v) && v >= 1 && v <= 365) setSelectedDays(v)
              }}
              className="flex-1 text-center py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-bold text-primary focus:outline-none focus:ring-2 focus:ring-[#f77430]/25"
            />
            <button
              onClick={() => setSelectedDays(d => Math.min(365, d + 1))}
              className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700"
            >
              +
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            {[3, 5, 7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setSelectedDays(d)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedDays === d
                    ? 'bg-[#f77430] text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  }`}
              >
                {d} дн.
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Promo code */}
      <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Промокод</h3>
        {isReferralPurchase && !manualPromoActive && (
          <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900/40 dark:bg-green-900/20">
            <p className="text-xs font-medium text-green-700 dark:text-green-400">
              Покупка по партнёрской ссылке
            </p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              {autoPromoUnavailable && serverPromoMessage
                ? serverPromoMessage
                : quotePromoCode
                  ? `Промокод ${quotePromoCode} будет применён автоматически к первой покупке.`
                  : 'Скидка по партнёрской ссылке будет применена автоматически после пересчёта цены.'}
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase())
                setPromoApplied(false)
                setPromoDiscount(0)
                setPromoError('')
              }}
              placeholder="Введите промокод"
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f77430]/25 ${manualPromoActive || autoPromoActive ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : promoError ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
            />
          </div>
          <button
            onClick={async () => {
              if (!promoCode.trim()) return
              setPromoLoading(true)
              setPromoError('')
              try {
                const res = await promoApi.validate(promoCode)
                setPromoApplied(true)
                setPromoDiscount(res.discountPercent)
              } catch (e: any) {
                setPromoApplied(false)
                setPromoDiscount(0)
                setPromoError(e?.response?.data?.message || 'Промокод не найден')
              } finally {
                setPromoLoading(false)
              }
            }}
            disabled={!promoCode.trim() || promoLoading || promoApplied}
            className="px-4 py-2.5 rounded-xl bg-[#f77430] text-white text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            {promoLoading ? '...' : promoApplied ? '✓' : 'Применить'}
          </button>
        </div>
        {manualPromoActive && promoDiscountAmount > 0 && (
          <p className="text-xs text-green-600 mt-2 font-medium">
            Скидка {promoDiscount}% применена! Вы экономите ₽{formatPrice(promoDiscountAmount)}
          </p>
        )}
        {autoPromoActive && effectivePromoCode && (
          <>
            <p className="text-xs text-green-600 mt-2 font-medium">
              Промокод {effectivePromoCode} по партнёрской ссылке применится автоматически.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Итоговая сумма уже пересчитана. Если ввести другой промокод, он заменит автоматический.
            </p>
          </>
        )}
        {autoPromoUnavailable && serverPromoMessage && (
          <p className="text-xs text-amber-600 mt-2">{serverPromoMessage}</p>
        )}
        {promoError && (
          <p className="text-xs text-red-500 mt-2">{promoError}</p>
        )}
      </div>

      {/* Final pricing summary */}
      <div className="card-neutral p-4 mb-4 animate-slide-up bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Итог к оплате</p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Сумма списания при оплате этим заказом
            </p>
          </div>
          <div className="text-right">
            {pricingPending ? (
              <p className="text-lg font-bold text-primary">...</p>
            ) : (
              <p className="text-2xl font-bold text-primary">₽{formatPrice(payableTotal)}</p>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Тариф</span>
            <span className="text-sm font-medium text-primary">₽{formatPrice(displayedBasePrice)}</span>
          </div>
          {hasAnyPromoDiscount && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-700 dark:text-green-400">
                {manualPromoActive
                  ? `Промокод ${quotePromoCode || promoCode.trim()} (${promoDiscount}%)`
                  : `Промокод ${effectivePromoCode}`}
              </span>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">−₽{formatPrice(promoDiscountAmount)}</span>
            </div>
          )}
          {loyaltyDiscountAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-700 dark:text-green-400">Скидка лояльности</span>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">−₽{formatPrice(loyaltyDiscountAmount)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
          <span className="text-sm font-semibold text-primary">К списанию</span>
          {pricingPending ? (
            <span className="text-sm text-gray-500">Пересчитываем...</span>
          ) : (
            <span className="text-xl font-bold text-primary">₽{formatPrice(payableTotal)}</span>
          )}
        </div>
        {pricingPending && (
          <p className="text-xs text-gray-500 mt-2">
            Подтверждаем цену на сервере с учётом промокода, реферальной ссылки и уровня лояльности.
          </p>
        )}
        {!pricingPending && isReferralPurchase && (
          <p className={`text-xs mt-2 ${hasAnyPromoDiscount ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {hasAnyPromoDiscount
              ? 'Это реферальная покупка. Скидка уже включена в сумму списания.'
              : 'Это реферальная покупка. Сейчас заказ будет оформлен без реферальной скидки.'}
          </p>
        )}
        {pricingError && (
          <p className="text-xs text-red-500 mt-2">{pricingError}</p>
        )}
      </div>

      {/* Email for eSIM delivery */}
      <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.18s' }}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Email для получения eSIM</h3>
        <p className="text-xs text-gray-400 mb-3">Провайдер отправит QR-код на вашу почту</p>
        <div className="relative">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailSaved(false) }}
            placeholder="your@email.com (необязательно)"
            className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f77430]/25 transition-colors ${emailSaved ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}
          />
        </div>
        {emailSaved && (
          <p className="text-xs text-green-600 mt-1.5 font-medium">✓ Email из вашего профиля</p>
        )}
      </div>

      {/* Payment method — тоггл «С баланса / Картой» */}
      <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Способ оплаты</h3>
        <div className={`grid gap-2 ${savedCard ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {(() => {
            const userBalance = Number(balance ?? 0)
            const enoughBalance = userBalance >= payableTotal && payableTotal > 0
            return (
              <>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('balance')}
                  className={`flex flex-col items-start text-left px-3 py-3 rounded-xl border transition-all ${paymentMethod === 'balance'
                      ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Wallet size={18} className={paymentMethod === 'balance' ? 'text-[#f77430]' : 'text-gray-500'} />
                    <span className={`text-sm font-medium ${paymentMethod === 'balance' ? 'text-[#f77430]' : 'text-primary'}`}>
                      С баланса
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 mt-1">
                    {balance === null
                      ? '…'
                      : enoughBalance
                        ? `Доступно ₽${formatPrice(userBalance)}`
                        : `Не хватает ₽${formatPrice(payableTotal - userBalance)}`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod(savedCard ? 'saved_card' : 'card')}
                  className={`flex flex-col items-start text-left px-3 py-3 rounded-xl border transition-all ${(savedCard ? paymentMethod === 'saved_card' : paymentMethod === 'card')
                      ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <CreditCard size={18} className={(savedCard ? paymentMethod === 'saved_card' : paymentMethod === 'card') ? 'text-[#f77430]' : 'text-gray-500'} />
                    <span className={`text-sm font-medium ${(savedCard ? paymentMethod === 'saved_card' : paymentMethod === 'card') ? 'text-[#f77430]' : 'text-primary'}`}>
                      {savedCard ? 'Привязанная карта' : 'Картой'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 mt-1">
                    {savedCardLabel || 'Visa, MC, МИР'}
                  </span>
                </button>
                {savedCard && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`flex flex-col items-start text-left px-3 py-3 rounded-xl border transition-all ${paymentMethod === 'card'
                        ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard size={18} className={paymentMethod === 'card' ? 'text-[#f77430]' : 'text-gray-500'} />
                      <span className={`text-sm font-medium ${paymentMethod === 'card' ? 'text-[#f77430]' : 'text-primary'}`}>
                        Новая карта
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 mt-1">Открыть CloudPayments widget</span>
                  </button>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {savedCardFollowUp && (
        <div className="card-neutral p-4 mb-4 animate-slide-up bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30">
          <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-500 mb-2">
            {savedCardFollowUp.kind === 'ambiguous'
              ? 'Платеж проверяется'
              : 'Запрос уже в работе'}
          </p>
          <p className="text-sm text-amber-950 dark:text-amber-200 leading-relaxed">
            {savedCardFollowUp.message}
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400 mt-2">
            Заказ: #{savedCardFollowUp.orderId.slice(-8)}
            {savedCardFollowUp.attemptId
              ? ` · attempt ${savedCardFollowUp.attemptId.slice(-8)}`
              : ''}
          </p>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => router.push('/orders')}
              className="flex-1 py-3 rounded-xl bg-[#f77430] text-white text-sm font-semibold"
            >
              Открыть заказы
            </button>
            <button
              type="button"
              onClick={() => router.push(`/order/${savedCardFollowUp.orderId}`)}
              className="flex-1 py-3 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-sm font-semibold"
            >
              Открыть заказ
            </button>
          </div>
        </div>
      )}

      {/* Checkboxes before purchase */}
      <div className="mb-4 animate-slide-up flex flex-col gap-2" style={{ animationDelay: '0.22s' }}>
        <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${agreedEsim
            ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50'
          }`}>
          <div className="shrink-0 flex items-center justify-center">
            <input
              type="checkbox"
              checked={agreedEsim}
              onChange={(e) => setAgreedEsim(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-[#f77430] focus:ring-[#f77430] dark:bg-gray-800 dark:border-gray-600 cursor-pointer"
            />
          </div>
          <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
            Я подтверждаю, что моё устройство совместимо с технологией eSIM
          </span>
        </label>
        <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${agreedOnlyInternet
            ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50'
          }`}>
          <div className="shrink-0 flex items-center justify-center">
            <input
              type="checkbox"
              checked={agreedOnlyInternet}
              onChange={(e) => setAgreedOnlyInternet(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-[#f77430] focus:ring-[#f77430] dark:bg-gray-800 dark:border-gray-600 cursor-pointer"
            />
          </div>
          <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
            Я понимаю, что eSIM работает только в стране назначения и на ней недоступны СМС и звонки
          </span>
        </label>
        <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${agreedTerms
            ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50'
          }`}>
          <div className="shrink-0 flex items-center justify-center">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-[#f77430] focus:ring-[#f77430] dark:bg-gray-800 dark:border-gray-600 cursor-pointer"
            />
          </div>
          <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
            Я принимаю <a href="https://app.mojomobile.ru/oferta.pdf" target="_blank" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>условия оферты</a>
          </span>
        </label>
      </div>

      {/* Bottom fixed purchase CTA */}
      <div className="h-28" />
      <div
        className="fixed left-0 right-0 z-[60] px-4"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-lg mx-auto">
          {(() => {
            const userBalance = Number(balance ?? 0)
            const enoughBalance = userBalance >= payableTotal && payableTotal > 0
            const showTopupCta = paymentMethod === 'balance' && !enoughBalance && payableTotal > 0 && balance !== null
            const need = Math.max(0, Math.ceil(payableTotal - userBalance))
            return (
                <button
                onClick={() => handlePurchase()}
                disabled={purchasing || pricingPending || Boolean(pricingError) || !agreedEsim || !agreedOnlyInternet || !agreedTerms}
                className="w-full py-4 rounded-2xl bg-[#f77430] hover:bg-[#f2622a] text-white font-semibold text-lg transition-colors shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {purchasing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Обработка...</span>
                  </>
                ) : pricingPending ? (
                  <span>Уточняем итоговую стоимость...</span>
                ) : showTopupCta ? (
                  <span>Пополнить на ₽{formatPrice(need)} и купить</span>
                ) : paymentMethod === 'balance' ? (
                  <span>Купить с баланса · ₽{formatPrice(payableTotal)}</span>
                ) : paymentMethod === 'saved_card' ? (
                  <span>Оплатить привязанной картой · ₽{formatPrice(payableTotal)}</span>
                ) : (
                  <span>Оплатить картой · ₽{formatPrice(payableTotal)}</span>
                )}
              </button>
            )
          })()}
        </div>
      </div>

      {/* Purchase progress overlay */}
      <PurchaseOverlay
        stage={purchaseStage}
        errorMessage={purchaseError}
        onClose={() => { setPurchaseStage(null); setPurchaseError(''); }}
      />
    </div>
  )
}
