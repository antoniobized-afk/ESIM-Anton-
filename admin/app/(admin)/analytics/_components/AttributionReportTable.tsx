'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/Table'
import Tooltip from '@/components/ui/Tooltip'
import type {
  MarketingAttributionReport,
  MarketingAttributionReportRow,
} from '@/lib/marketing-attribution-report.types'
import {
  formatMarketingCount,
  formatMarketingMoney,
} from './marketing-report-formatting'
import AttributionOrderDetailsModal from './AttributionOrderDetailsModal'

export default function AttributionReportTable({ report }: { report: MarketingAttributionReport }) {
  const [selectedRow, setSelectedRow] = useState<MarketingAttributionReportRow | null>(null)

  if (report.rows.length === 0) {
    return (
      <div className="glass-card glass-card--static p-8 text-center text-sm text-slate-600">
        В выбранном event-периоде нет фактов атрибуции.
      </div>
    )
  }

  return (
    <div className="glass-card glass-card--static overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHead className="bg-slate-50">
            <TableRow>
              <TableHeaderCell className="min-w-56">Источник</TableHeaderCell>
              <TableHeaderCell className="min-w-52">UTM</TableHeaderCell>
              <TableHeaderCell className="text-right">Клики</TableHeaderCell>
              <TableHeaderCell className="text-right">Регистрации</TableHeaderCell>
              <TableHeaderCell className="min-w-44 text-right">
                <Tooltip content="Первая завершённая основная покупка пользователя за всю историю. Она может быть до выбранного периода или до запуска атрибуции.">
                  <span className="inline-flex items-center gap-1">Первая покупка <Info aria-hidden="true" className="h-3.5 w-3.5" /></span>
                </Tooltip>
              </TableHeaderCell>
              <TableHeaderCell className="min-w-36 text-right">
                <Tooltip content="Каждая следующая завершённая основная покупка пользователя — вторая и далее. Заказ может быть впервые связан с этой кампанией, но остаться повторным для пользователя.">
                  <span className="inline-flex items-center gap-1">Повторные (2+) <Info aria-hidden="true" className="h-3.5 w-3.5" /></span>
                </Tooltip>
              </TableHeaderCell>
              <TableHeaderCell className="text-right">Выручка</TableHeaderCell>
              <TableHeaderCell className="text-right">Заказы</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.rows.map((row) => (
              <TableRow key={row.campaign?.id ?? 'direct'} className="border-t border-slate-100">
                <TableCell>
                  <div className="font-medium text-slate-900">
                    {row.campaign?.name || 'Прямой трафик'}
                  </div>
                  {row.campaign ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <code>{row.campaign.shortCode}</code>
                      <span className={row.campaign.isActive ? 'text-emerald-600' : 'text-slate-400'}>
                        {row.campaign.isActive ? 'Активна' : 'Неактивна'}
                      </span>
                    </div>
                  ) : <div className="mt-1 text-xs text-slate-400">Snapshot без campaign</div>}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {row.campaign
                    ? [row.campaign.utmSource, row.campaign.utmMedium, row.campaign.utmCampaign]
                      .filter(Boolean)
                      .join(' / ') || '—'
                    : '—'}
                </TableCell>
                <TableCell className="text-right font-medium">{formatMarketingCount(row.metrics.clicks)}</TableCell>
                <TableCell className="text-right font-medium">{formatMarketingCount(row.metrics.registrations)}</TableCell>
                <TableCell className="text-right font-medium">{formatMarketingCount(row.metrics.firstPurchases)}</TableCell>
                <TableCell className="text-right font-medium">{formatMarketingCount(row.metrics.repeatPurchases)}</TableCell>
                <TableCell className="text-right font-semibold text-slate-900">{formatMarketingMoney(row.metrics.revenue)}</TableCell>
                <TableCell className="text-right">
                  {row.metrics.purchases > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                      onClick={() => setSelectedRow(row)}
                    >
                      Заказы ({formatMarketingCount(row.metrics.purchases)})
                    </Button>
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {selectedRow ? (
        <AttributionOrderDetailsModal
          row={selectedRow}
          filters={report.filters}
          onClose={() => setSelectedRow(null)}
        />
      ) : null}
    </div>
  )
}
