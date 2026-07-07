'use client'

import BackHeader from '@/components/BackHeader'
import { PurchaseOverlay } from '@/components/PurchaseOverlay'
import { getCountryName } from '@/lib/utils'
import {
  AgreementCards,
  EmailDeliveryCard,
  PaymentMethodCard,
  PricingSummaryCard,
  PromoCodeCard,
  PurchaseCta,
  SavedCardFollowUpNotice,
} from './CheckoutCards'
import {
  DailyDaysSelector,
  OrderSummaryCard,
  ProductAdminNoteCard,
  ProductHeaderCard,
  ProductUsageInfoCard,
} from './ProductPlanCards'
import type { ProductCheckoutModel } from './useProductCheckout'

export function ProductPageView({ checkout }: { checkout: ProductCheckoutModel }) {
  const { product, plan, promo, pricing, email, payment, agreements, purchase } = checkout
  if (!product) return null

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-32">
      <BackHeader
        title={getCountryName(product.country)}
        onBack={checkout.handleBack}
      />

      <ProductHeaderCard product={product} afterLimitNote={plan.afterLimitNote} />
      <OrderSummaryCard
        product={product}
        isDaily={plan.isDaily}
        purchaseDays={plan.purchaseDays}
        coverageSummary={plan.coverageSummary}
        displayedBasePrice={plan.displayedBasePrice}
      />
      <ProductAdminNoteCard product={product} />
      <ProductUsageInfoCard />

      {plan.isDaily && (
        <DailyDaysSelector
          maxDays={plan.maxDays}
          purchaseDays={plan.purchaseDays}
          quickDayOptions={plan.quickDayOptions}
          onChange={plan.changePurchaseDays}
          onDecrement={plan.decrementPurchaseDays}
          onIncrement={plan.incrementPurchaseDays}
        />
      )}

      <PromoCodeCard promo={promo} />
      <PricingSummaryCard promo={promo} pricing={pricing} displayedBasePrice={plan.displayedBasePrice} />
      <EmailDeliveryCard email={email} />
      <PaymentMethodCard payment={payment} payableTotal={pricing.payableTotal} />

      {payment.savedCardFollowUp && (
        <SavedCardFollowUpNotice
          followUp={payment.savedCardFollowUp}
          onOpenOrders={payment.openSavedCardOrders}
          onOpenOrder={payment.openSavedCardOrder}
        />
      )}

      <AgreementCards agreements={agreements} />
      <PurchaseCta
        payment={payment}
        pricing={pricing}
        agreements={agreements}
        purchase={purchase}
      />

      <PurchaseOverlay
        stage={purchase.purchaseStage}
        errorMessage={purchase.purchaseError}
        onClose={purchase.closePurchaseOverlay}
      />
    </div>
  )
}
