import type { AdminOrder } from '@/lib/types'
import { formatOrderPrice, hasOrderDiscount } from './orders.constants'

interface OrderPriceCellProps {
  order: AdminOrder
}

export default function OrderPriceCell({ order }: OrderPriceCellProps) {
  const discounted = hasOrderDiscount(order)
  const promoAmount = Number(order.promoDiscount || 0)
  const loyaltyAmount = Number(order.discount || 0)
  const bonusAmount = Number(order.bonusUsed || 0)

  if (!discounted) {
    return (
      <span className="font-bold">
        {formatOrderPrice(order.totalAmount)}
      </span>
    )
  }

  return (
    <div className="text-sm space-y-0.5">
      <div className="text-slate-400 line-through">
        {formatOrderPrice(order.productPrice)}
      </div>

      {promoAmount > 0 && (
        <div className="text-orange-600">
          -{formatOrderPrice(promoAmount)}{' '}
          {order.promoCode && (
            <span className="inline-block px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 text-xs font-medium">
              {order.promoCode}
            </span>
          )}
        </div>
      )}

      {loyaltyAmount > 0 && (
        <div className="text-purple-600">
          -{formatOrderPrice(loyaltyAmount)} лояльность
        </div>
      )}

      {bonusAmount > 0 && (
        <div className="text-green-600">
          -{formatOrderPrice(bonusAmount)} бонусы
        </div>
      )}

      <div className="font-bold text-slate-900 pt-0.5 border-t border-slate-200">
        {formatOrderPrice(order.totalAmount)}
      </div>
    </div>
  )
}
