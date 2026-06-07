import type { AdminOrder } from '@/lib/types'
import Button from '@/components/ui/Button'
import { TableCell } from '@/components/ui/Table'
import { getOrderActionAvailability } from './orders.constants'

interface OrderActionsCellProps {
  order: AdminOrder
  onRetryFulfillment: (orderId: string) => void
  onRecoverPaidPending: (orderId: string) => void
  onFulfillFree: (orderId: string) => void
  onFinalizeReconcile: (orderId: string) => void
  onRetryCompletionAccounting: (orderId: string) => void
  onCancel: (orderId: string) => void
}

export default function OrderActionsCell(props: OrderActionsCellProps) {
  const {
    order,
    onRetryFulfillment,
    onRecoverPaidPending,
    onFulfillFree,
    onFinalizeReconcile,
    onRetryCompletionAccounting,
    onCancel,
  } = props
  const {
    canRetryFulfillment,
    canRecoverPaidPending,
    canFulfillFree,
    canFinalizeReconcile,
    canRetryCompletionAccounting,
    canCancel,
  } = getOrderActionAvailability(order)

  return (
    <TableCell>
      <div className="flex min-w-32 flex-col items-start gap-1">
        {canRetryFulfillment && (
          <Button
            onClick={() => onRetryFulfillment(order.id)}
            variant="ghost"
            size="sm"
            className="px-0 text-xs text-blue-600 hover:bg-transparent hover:text-blue-700"
          >
            Retry fulfillment
          </Button>
        )}

        {canRecoverPaidPending && (
          <Button
            onClick={() => onRecoverPaidPending(order.id)}
            variant="ghost"
            size="sm"
            className="px-0 text-xs text-blue-600 hover:bg-transparent hover:text-blue-700"
          >
            Recovery оплаты
          </Button>
        )}

        {canFulfillFree && (
          <Button
            onClick={() => onFulfillFree(order.id)}
            variant="ghost"
            size="sm"
            className="px-0 text-xs text-emerald-600 hover:bg-transparent hover:text-emerald-700"
          >
            Выполнить бесплатно
          </Button>
        )}

        {canFinalizeReconcile && (
          <Button
            onClick={() => onFinalizeReconcile(order.id)}
            variant="ghost"
            size="sm"
            className="px-0 text-xs text-amber-600 hover:bg-transparent hover:text-amber-700"
          >
            Дофинализировать
          </Button>
        )}

        {canRetryCompletionAccounting && (
          <Button
            onClick={() => onRetryCompletionAccounting(order.id)}
            variant="ghost"
            size="sm"
            className="px-0 text-xs text-amber-600 hover:bg-transparent hover:text-amber-700"
          >
            Повторить учёт
          </Button>
        )}

        {canCancel && (
          <Button
            onClick={() => onCancel(order.id)}
            variant="ghost"
            size="sm"
            className="px-0 text-xs text-red-500 hover:bg-transparent hover:text-red-700"
          >
            Отменить
          </Button>
        )}
      </div>
    </TableCell>
  )
}
