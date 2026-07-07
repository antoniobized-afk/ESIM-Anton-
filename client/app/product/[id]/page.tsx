'use client'

import { Suspense } from 'react'
import { ProductNotFound, ProductPageLoading } from './_components/ProductPageStates'
import { ProductPageView } from './_components/ProductPageView'
import { useProductCheckout } from './_components/useProductCheckout'

export default function ProductPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ProductPageInner />
    </Suspense>
  )
}

function ProductPageInner() {
  const checkout = useProductCheckout()

  if (checkout.loading) {
    return <ProductPageLoading />
  }

  if (!checkout.product) {
    return <ProductNotFound onBack={checkout.handleBack} />
  }

  return <ProductPageView checkout={checkout} />
}
