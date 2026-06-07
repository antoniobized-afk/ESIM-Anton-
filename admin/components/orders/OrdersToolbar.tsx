import { AlertTriangle, Download } from 'lucide-react'
import type { OrderStatus } from '@/lib/types'
import Button from '@/components/ui/Button'
import { STATUS_OPTIONS } from './orders.constants'

interface OrdersToolbarProps {
  totalCount: number
  statusFilter: OrderStatus | ''
  needsAttentionOnly: boolean
  exporting: boolean
  hasOrders: boolean
  onStatusChange: (value: OrderStatus | '') => void
  onNeedsAttentionToggle: () => void
  onExport: () => void
  onRefresh: () => void
}

export default function OrdersToolbar(props: OrdersToolbarProps) {
  const {
    totalCount,
    statusFilter,
    needsAttentionOnly,
    exporting,
    hasOrders,
    onStatusChange,
    onNeedsAttentionToggle,
    onExport,
    onRefresh,
  } = props

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h2 className="text-2xl font-bold">
        Все заказы
        <span className="ml-2 text-base font-normal text-slate-500">({totalCount})</span>
      </h2>

      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value as OrderStatus | '')}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <Button
          onClick={onNeedsAttentionToggle}
          variant={needsAttentionOnly ? 'primary' : 'secondary'}
          size="sm"
          className={needsAttentionOnly ? '' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}
        >
          <AlertTriangle className="w-4 h-4" />
          Требуют внимания
        </Button>

        <Button
          onClick={onExport}
          disabled={exporting || !hasOrders}
          variant="secondary"
          className="bg-green-50 text-green-700 hover:bg-green-100"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Экспорт...' : 'Excel'}
        </Button>

        <Button onClick={onRefresh} variant="ghost" size="sm" className="px-0 text-blue-600 hover:bg-transparent hover:text-blue-700">
          Обновить
        </Button>
      </div>
    </div>
  )
}
