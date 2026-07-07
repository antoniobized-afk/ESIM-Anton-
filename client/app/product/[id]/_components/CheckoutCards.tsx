'use client'

import { CreditCard, Mail, Tag, Wallet } from '@/components/icons'
import { formatPrice } from '@/lib/utils'
import type { ProductCheckoutModel } from './useProductCheckout'
import type { ProductPaymentMethod, SavedCardFollowUpState } from './types'

type PromoState = ProductCheckoutModel['promo']
type PricingState = ProductCheckoutModel['pricing']
type EmailState = ProductCheckoutModel['email']
type PaymentState = ProductCheckoutModel['payment']
type AgreementState = ProductCheckoutModel['agreements']
type PurchaseState = ProductCheckoutModel['purchase']

export function PromoCodeCard({ promo }: { promo: PromoState }) {
  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.15s' }}>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Промокод</h3>
      {promo.isReferralPurchase && !promo.manualPromoActive && (
        <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900/40 dark:bg-green-900/20">
          <p className="text-xs font-medium text-green-700 dark:text-green-400">
            Покупка по партнёрской ссылке
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            {promo.autoPromoUnavailable && promo.serverPromoMessage
              ? promo.serverPromoMessage
              : promo.quotePromoCode
                ? `Промокод ${promo.quotePromoCode} будет применён автоматически к первой покупке.`
                : 'Скидка по партнёрской ссылке будет применена автоматически после пересчёта цены.'}
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={promo.promoCode}
            onChange={(e) => promo.updatePromoCode(e.target.value)}
            placeholder="Введите промокод"
            className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f77430]/25 ${promo.manualPromoActive || promo.autoPromoActive ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : promo.promoError ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}
          />
        </div>
        <button
          onClick={promo.applyPromoCode}
          disabled={!promo.promoCode.trim() || promo.promoLoading || promo.promoApplied}
          className="px-4 py-2.5 rounded-xl bg-[#f77430] text-white text-sm font-medium disabled:opacity-40 transition-opacity"
        >
          {promo.promoLoading ? '...' : promo.promoApplied ? '✓' : 'Применить'}
        </button>
      </div>
      {promo.manualPromoActive && promo.promoDiscountAmount > 0 && (
        <p className="text-xs text-green-600 mt-2 font-medium">
          Скидка {promo.promoDiscount}% применена! Вы экономите ₽{formatPrice(promo.promoDiscountAmount)}
        </p>
      )}
      {promo.autoPromoActive && promo.effectivePromoCode && (
        <>
          <p className="text-xs text-green-600 mt-2 font-medium">
            Промокод {promo.effectivePromoCode} по партнёрской ссылке применится автоматически.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Итоговая сумма уже пересчитана. Если ввести другой промокод, он заменит автоматический.
          </p>
        </>
      )}
      {promo.autoPromoUnavailable && promo.serverPromoMessage && (
        <p className="text-xs text-amber-600 mt-2">{promo.serverPromoMessage}</p>
      )}
      {promo.promoError && (
        <p className="text-xs text-red-500 mt-2">{promo.promoError}</p>
      )}
    </div>
  )
}

export function PricingSummaryCard({
  promo,
  pricing,
  displayedBasePrice,
}: {
  promo: PromoState
  pricing: PricingState
  displayedBasePrice: number
}) {
  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Итог к оплате</p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Сумма списания при оплате этим заказом
          </p>
        </div>
        <div className="text-right">
          {pricing.pricingPending ? (
            <p className="text-lg font-bold text-primary">...</p>
          ) : (
            <p className="text-2xl font-bold text-primary">₽{formatPrice(pricing.payableTotal)}</p>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-300">Тариф</span>
          <span className="text-sm font-medium text-primary">₽{formatPrice(displayedBasePrice)}</span>
        </div>
        {promo.hasAnyPromoDiscount && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700 dark:text-green-400">
              {promo.manualPromoActive
                ? `Промокод ${promo.quotePromoCode || promo.promoCode.trim()} (${promo.promoDiscount}%)`
                : `Промокод ${promo.effectivePromoCode}`}
            </span>
            <span className="text-sm font-medium text-green-700 dark:text-green-400">−₽{formatPrice(promo.promoDiscountAmount)}</span>
          </div>
        )}
        {pricing.loyaltyDiscountAmount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700 dark:text-green-400">Скидка лояльности</span>
            <span className="text-sm font-medium text-green-700 dark:text-green-400">−₽{formatPrice(pricing.loyaltyDiscountAmount)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
        <span className="text-sm font-semibold text-primary">К списанию</span>
        {pricing.pricingPending ? (
          <span className="text-sm text-gray-500">Пересчитываем...</span>
        ) : (
          <span className="text-xl font-bold text-primary">₽{formatPrice(pricing.payableTotal)}</span>
        )}
      </div>
      {pricing.pricingPending && (
        <p className="text-xs text-gray-500 mt-2">
          Подтверждаем цену на сервере с учётом промокода, реферальной ссылки и уровня лояльности.
        </p>
      )}
      {!pricing.pricingPending && promo.isReferralPurchase && (
        <p className={`text-xs mt-2 ${promo.hasAnyPromoDiscount ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
          {promo.hasAnyPromoDiscount
            ? 'Это реферальная покупка. Скидка уже включена в сумму списания.'
            : 'Это реферальная покупка. Сейчас заказ будет оформлен без реферальной скидки.'}
        </p>
      )}
      {pricing.pricingError && (
        <p className="text-xs text-red-500 mt-2">{pricing.pricingError}</p>
      )}
    </div>
  )
}

export function EmailDeliveryCard({ email }: { email: EmailState }) {
  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.18s' }}>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Email для получения eSIM</h3>
      <p className="text-xs text-gray-400 mb-3">Провайдер отправит QR-код на вашу почту</p>
      <div className="relative">
        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="email"
          value={email.value}
          onChange={(e) => email.onChange(e.target.value)}
          placeholder="your@email.com (необязательно)"
          className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f77430]/25 transition-colors ${email.saved ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
            }`}
        />
      </div>
      {email.saved && (
        <p className="text-xs text-green-600 mt-1.5 font-medium">✓ Email из вашего профиля</p>
      )}
    </div>
  )
}

export function PaymentMethodCard({
  payment,
  payableTotal,
}: {
  payment: PaymentState
  payableTotal: number
}) {
  const userBalance = Number(payment.balance ?? 0)
  const freeOrder = payableTotal <= 0
  const enoughBalance = userBalance >= payableTotal && payableTotal > 0
  const selectedCardMethod: ProductPaymentMethod = payment.savedCard ? 'saved_card' : 'card'

  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Способ оплаты</h3>
      <div className={`grid gap-2 ${payment.savedCard ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <button
          type="button"
          onClick={() => payment.setPaymentMethod('balance')}
          className={`flex flex-col items-start text-left px-3 py-3 rounded-xl border transition-all ${payment.paymentMethod === 'balance'
            ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Wallet size={18} className={payment.paymentMethod === 'balance' ? 'text-[#f77430]' : 'text-gray-500'} />
            <span className={`text-sm font-medium ${payment.paymentMethod === 'balance' ? 'text-[#f77430]' : 'text-primary'}`}>
              С баланса
            </span>
          </div>
          <span className="text-xs text-gray-500 mt-1">
            {payment.balance === null
              ? '…'
              : freeOrder
                ? 'Оплата не требуется'
              : enoughBalance
                ? `Доступно ₽${formatPrice(userBalance)}`
                : `Не хватает ₽${formatPrice(payableTotal - userBalance)}`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => payment.setPaymentMethod(selectedCardMethod)}
          className={`flex flex-col items-start text-left px-3 py-3 rounded-xl border transition-all ${payment.paymentMethod === selectedCardMethod
            ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <CreditCard size={18} className={payment.paymentMethod === selectedCardMethod ? 'text-[#f77430]' : 'text-gray-500'} />
            <span className={`text-sm font-medium ${payment.paymentMethod === selectedCardMethod ? 'text-[#f77430]' : 'text-primary'}`}>
              {payment.savedCard ? 'Привязанная карта' : 'Картой'}
            </span>
          </div>
          <span className="text-xs text-gray-500 mt-1">
            {payment.savedCardLabel || 'Visa, MC, МИР'}
          </span>
        </button>
        {payment.savedCard && (
          <button
            type="button"
            onClick={() => payment.setPaymentMethod('card')}
            className={`flex flex-col items-start text-left px-3 py-3 rounded-xl border transition-all ${payment.paymentMethod === 'card'
              ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <CreditCard size={18} className={payment.paymentMethod === 'card' ? 'text-[#f77430]' : 'text-gray-500'} />
              <span className={`text-sm font-medium ${payment.paymentMethod === 'card' ? 'text-[#f77430]' : 'text-primary'}`}>
                Новая карта
              </span>
            </div>
            <span className="text-xs text-gray-500 mt-1">Открыть CloudPayments widget</span>
          </button>
        )}
      </div>
    </div>
  )
}

export function SavedCardFollowUpNotice({
  followUp,
  onOpenOrders,
  onOpenOrder,
}: {
  followUp: SavedCardFollowUpState
  onOpenOrders: () => void
  onOpenOrder: (orderId: string) => void
}) {
  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30">
      <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-500 mb-2">
        {followUp.kind === 'ambiguous'
          ? 'Платеж проверяется'
          : 'Запрос уже в работе'}
      </p>
      <p className="text-sm text-amber-950 dark:text-amber-200 leading-relaxed">
        {followUp.message}
      </p>
      <p className="text-xs text-amber-700/80 dark:text-amber-400 mt-2">
        Заказ: #{followUp.orderId.slice(-8)}
        {followUp.attemptId
          ? ` · attempt ${followUp.attemptId.slice(-8)}`
          : ''}
      </p>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onOpenOrders}
          className="flex-1 py-3 rounded-xl bg-[#f77430] text-white text-sm font-semibold"
        >
          Открыть заказы
        </button>
        <button
          type="button"
          onClick={() => onOpenOrder(followUp.orderId)}
          className="flex-1 py-3 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-sm font-semibold"
        >
          Открыть заказ
        </button>
      </div>
    </div>
  )
}

export function AgreementCards({ agreements }: { agreements: AgreementState }) {
  return (
    <div className="mb-4 animate-slide-up flex flex-col gap-2" style={{ animationDelay: '0.22s' }}>
      <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${agreements.agreedEsim
        ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50'
      }`}>
        <div className="shrink-0 flex items-center justify-center">
          <input
            type="checkbox"
            checked={agreements.agreedEsim}
            onChange={(e) => agreements.setAgreedEsim(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-[#f77430] focus:ring-[#f77430] dark:bg-gray-800 dark:border-gray-600 cursor-pointer"
          />
        </div>
        <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
          Я подтверждаю, что моё устройство совместимо с технологией eSIM
        </span>
      </label>
      <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${agreements.agreedOnlyInternet
        ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50'
      }`}>
        <div className="shrink-0 flex items-center justify-center">
          <input
            type="checkbox"
            checked={agreements.agreedOnlyInternet}
            onChange={(e) => agreements.setAgreedOnlyInternet(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-[#f77430] focus:ring-[#f77430] dark:bg-gray-800 dark:border-gray-600 cursor-pointer"
          />
        </div>
        <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
          Я понимаю, что eSIM работает только в стране назначения и на ней недоступны СМС и звонки
        </span>
      </label>
      <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${agreements.agreedTerms
        ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50'
      }`}>
        <div className="shrink-0 flex items-center justify-center">
          <input
            type="checkbox"
            checked={agreements.agreedTerms}
            onChange={(e) => agreements.setAgreedTerms(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-[#f77430] focus:ring-[#f77430] dark:bg-gray-800 dark:border-gray-600 cursor-pointer"
          />
        </div>
        <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
          Я принимаю <a href="https://app.mojomobile.ru/oferta.pdf" target="_blank" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>условия оферты</a>
        </span>
      </label>
    </div>
  )
}

export function PurchaseCta({
  payment,
  pricing,
  agreements,
  purchase,
}: {
  payment: PaymentState
  pricing: PricingState
  agreements: AgreementState
  purchase: PurchaseState
}) {
  const userBalance = Number(payment.balance ?? 0)
  const enoughBalance = userBalance >= pricing.payableTotal && pricing.payableTotal > 0
  const showTopupCta = payment.paymentMethod === 'balance' && !enoughBalance && pricing.payableTotal > 0 && payment.balance !== null
  const need = Math.max(0, Math.ceil(pricing.payableTotal - userBalance))

  return (
    <>
      <div className="h-28" />
      <div
        className="fixed left-0 right-0 z-[60] px-4"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => purchase.handlePurchase()}
            disabled={
              purchase.purchasing ||
              pricing.pricingPending ||
              Boolean(pricing.pricingError) ||
              !agreements.agreedEsim ||
              !agreements.agreedOnlyInternet ||
              !agreements.agreedTerms
            }
            className="w-full py-4 rounded-2xl bg-[#f77430] hover:bg-[#f2622a] text-white font-semibold text-lg transition-colors shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {purchase.purchasing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Обработка...</span>
              </>
            ) : pricing.pricingPending ? (
              <span>Уточняем итоговую стоимость...</span>
            ) : showTopupCta ? (
              <span>Пополнить на ₽{formatPrice(need)} и купить</span>
            ) : payment.paymentMethod === 'balance' ? (
              <span>Купить с баланса · ₽{formatPrice(pricing.payableTotal)}</span>
            ) : payment.paymentMethod === 'saved_card' ? (
              <span>Оплатить привязанной картой · ₽{formatPrice(pricing.payableTotal)}</span>
            ) : (
              <span>Оплатить картой · ₽{formatPrice(pricing.payableTotal)}</span>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
