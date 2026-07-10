import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/Table'
import type { MarketingAttributionReport } from '@/lib/marketing-attribution-report.types'
import {
  formatMarketingCount,
  formatMarketingMoney,
} from './marketing-report-formatting'

export default function AttributionReportTable({ report }: { report: MarketingAttributionReport }) {
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
              <TableHeaderCell className="text-right">Первые покупки</TableHeaderCell>
              <TableHeaderCell className="text-right">Повторные</TableHeaderCell>
              <TableHeaderCell className="text-right">Выручка</TableHeaderCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
