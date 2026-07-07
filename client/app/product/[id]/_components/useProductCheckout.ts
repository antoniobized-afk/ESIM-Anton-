'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import {
  ordersApi,
  paymentsApi,
  productsApi,
  promoApi,
  userApi,
  type OrderQuote,
  type Product,
} from '@/lib/api'
import { getAfterLimitNote } from '@/lib/utils'
import { getCoverageSummary } from '@/lib/productCoverage'
import { sanitizeRedirect } from '@/lib/security'
import type { PurchaseStage } from '@/components/PurchaseOverlay'
import type { SavedPaymentCardSummary } from '@shared/contracts/checkout'
import {
  QUICK_DAY_OPTIONS,
  clampPurchaseDays,
  getApiErrorMessage,
  getPurchaseMaxDays,
  getQuotePromoDiscountPercent,
  getRequestedPurchaseDays,
  getSavedCardLabel,
} from './checkout-helpers'
import type { ProductPaymentMethod, SavedCardFollowUpState } from './types'
import { usePurchaseAction } from './usePurchaseAction'

export function useProductCheckout() {
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
  const requestedPurchaseDays = getRequestedPurchaseDays(searchParams.get('days'))
  const [selectedDays, setSelectedDays] = useState(() => requestedPurchaseDays ?? 7)
  const [email, setEmail] = useState('')
  const [emailSaved, setEmailSaved] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<ProductPaymentMethod>('card')
  const [savedCard, setSavedCard] = useState<SavedPaymentCardSummary | null>(null)
  const [savedCardFollowUp, setSavedCardFollowUp] = useState<SavedCardFollowUpState | null>(null)
  const [agreedEsim, setAgreedEsim] = useState(false)
  const [agreedOnlyInternet, setAgreedOnlyInternet] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const autoBuyTriggeredRef = useRef(false)

  const isDaily = product?.isUnlimited === true
  const maxDays = getPurchaseMaxDays(product)
  const purchaseDays = isDaily ? clampPurchaseDays(selectedDays, maxDays) : 1
  const quickDayOptions = QUICK_DAY_OPTIONS.filter((days) => days <= maxDays)
  const basePrice = isDaily && product ? product.ourPrice * purchaseDays : product?.ourPrice ?? 0
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
  const afterLimitNote = product ? getAfterLimitNote(product) : null
  const savedCardLabel = getSavedCardLabel(savedCard)
  const safeReturnTo = sanitizeRedirect(searchParams.get('returnTo'), '')

  useEffect(() => {
    if (authUser?.email && !email) {
      setEmail(authUser.email)
      setEmailSaved(true)
    }
  }, [authUser, email])

  useEffect(() => {
    if (!isDaily) return
    setSelectedDays((prev) => clampPurchaseDays(requestedPurchaseDays ?? prev, maxDays))
  }, [isDaily, maxDays, requestedPurchaseDays])

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
          ...(isDaily && purchaseDays > 1 ? { periodNum: purchaseDays } : {}),
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
  }, [authLoading, authToken, authUser?.id, isDaily, product, promoApplied, promoCode, purchaseDays])

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

  const handleBack = useCallback(() => {
    if (safeReturnTo) {
      router.push(safeReturnTo)
      return
    }

    if (product?.country) {
      router.push(`/country/${encodeURIComponent(product.country)}`)
      return
    }

    router.push('/')
  }, [product?.country, router, safeReturnTo])

  const changePurchaseDays = useCallback((value: number) => {
    if (Number.isInteger(value) && value >= 1 && value <= maxDays) {
      setSelectedDays(value)
    }
  }, [maxDays])

  const decrementPurchaseDays = useCallback(() => {
    setSelectedDays((days) => clampPurchaseDays(days - 1, maxDays))
  }, [maxDays])

  const incrementPurchaseDays = useCallback(() => {
    setSelectedDays((days) => clampPurchaseDays(days + 1, maxDays))
  }, [maxDays])

  const updatePromoCode = useCallback((value: string) => {
    setPromoCode(value.toUpperCase())
    setPromoApplied(false)
    setPromoDiscount(0)
    setPromoError('')
  }, [])

  const applyPromoCode = useCallback(async () => {
    if (!promoCode.trim()) return
    setPromoLoading(true)
    setPromoError('')
    try {
      const normalizedPromoCode = promoCode.trim()
      if (product && (authUser?.id || authToken)) {
        const quote = await ordersApi.quote({
          productId: product.id,
          quantity: 1,
          ...(isDaily && purchaseDays > 1 ? { periodNum: purchaseDays } : {}),
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
  }, [authToken, authUser?.id, isDaily, product, promoCode, purchaseDays])

  const handlePurchase = usePurchaseAction({
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
  })

  useEffect(() => {
    if (!purchaseStage || purchaseStage === 'error' || purchaseStage === 'done') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [purchaseStage])

  useEffect(() => {
    if (autoBuyTriggeredRef.current) return
    if (searchParams.get('autoBuy') !== '1') return
    if (!product || balance === null) return
    if (pricingPending) return
    if (payableTotal <= 0 || balance < payableTotal) return

    autoBuyTriggeredRef.current = true
    void handlePurchase('balance')
  }, [balance, handlePurchase, payableTotal, pricingPending, product, searchParams])

  const closePurchaseOverlay = useCallback(() => {
    setPurchaseStage(null)
    setPurchaseError('')
  }, [])

  const openSavedCardOrders = useCallback(() => {
    router.push('/orders')
  }, [router])

  const openSavedCardOrder = useCallback((orderId: string) => {
    router.push(`/order/${orderId}`)
  }, [router])

  return {
    product,
    loading,
    handleBack,
    plan: {
      isDaily,
      maxDays,
      purchaseDays,
      quickDayOptions,
      displayedBasePrice,
      coverageSummary,
      afterLimitNote,
      changePurchaseDays,
      decrementPurchaseDays,
      incrementPurchaseDays,
    },
    promo: {
      promoCode,
      promoApplied,
      promoDiscount,
      promoError,
      promoLoading,
      promoDiscountAmount,
      quotePromoCode,
      effectivePromoCode,
      serverPromoMessage,
      manualPromoActive,
      autoPromoActive,
      autoPromoUnavailable,
      isReferralPurchase,
      hasAnyPromoDiscount,
      updatePromoCode,
      applyPromoCode,
    },
    pricing: {
      payableTotal,
      loyaltyDiscountAmount,
      pricingError,
      pricingPending,
    },
    email: {
      value: email,
      saved: emailSaved,
      onChange: (value: string) => {
        setEmail(value)
        setEmailSaved(false)
      },
    },
    payment: {
      balance,
      paymentMethod,
      setPaymentMethod,
      savedCard,
      savedCardLabel,
      savedCardFollowUp,
      openSavedCardOrders,
      openSavedCardOrder,
    },
    agreements: {
      agreedEsim,
      agreedOnlyInternet,
      agreedTerms,
      setAgreedEsim,
      setAgreedOnlyInternet,
      setAgreedTerms,
    },
    purchase: {
      purchasing,
      purchaseStage,
      purchaseError,
      handlePurchase,
      closePurchaseOverlay,
    },
  }
}

export type ProductCheckoutModel = ReturnType<typeof useProductCheckout>
