import type { AdminOrder } from '@/lib/types'
import { getReconciliationText, STATUS_COLOR, STATUS_TEXT } from './orders.constants'

interface OrderStatusCellProps {
  order: AdminOrder
}

export default function OrderStatusCell({ order }: OrderStatusCellProps) {
  const reconciliationText = getReconciliationText(order)

  return (
    <div className="flex min-w-40 flex-col gap-1">
      <span className={`w-fit px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLOR[order.status] || 'bg-gray-100 text-gray-700'}`}>
        {STATUS_TEXT[order.status] || order.status}
      </span>

      {reconciliationText && (
        <span className="text-xs font-medium text-amber-700">
          {reconciliationText}
        </span>
      )}

      {order.reconciliation?.lastError && (
        <span className="max-w-56 truncate text-xs text-slate-500" title={order.reconciliation.lastError}>
          {order.reconciliation.lastError}
        </span>
      )}
    </div>
  )
}
