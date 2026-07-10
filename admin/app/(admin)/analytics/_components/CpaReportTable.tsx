import { formatMarketingPartner } from '@shared/marketing-attribution-report'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/Table'
import type {
  MarketingCpaReport,
  MarketingCpaPayoutMode,
} from '@/lib/marketing-attribution-report.types'
import {
  formatMarketingCount,
  formatMarketingMoney,
} from './marketing-report-formatting'

const PAYOUT_MODE_LABELS: Record<MarketingCpaPayoutMode, string> = {
  BALANCE: 'Баланс',
  EXTERNAL: 'Внешняя выплата',
  UNKNOWN: 'Режим не указан',
}

export default function CpaReportTable({ report }: { report: MarketingCpaReport }) {
  if (report.rows.length === 0) {
    return (
      <div className="glass-card glass-card--static p-8 text-center text-sm text-slate-600">
        Нет кампаний, связанных с referral link.
      </div>
    )
  }

  return (
    <div className="glass-card glass-card--static overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHead className="bg-slate-50">
            <TableRow>
              <TableHeaderCell className="min-w-52">Партнёр</TableHeaderCell>
              <TableHeaderCell className="min-w-52">Кампания</TableHeaderCell>
              <TableHeaderCell className="text-right">Покупки</TableHeaderCell>
              <TableHeaderCell className="text-right">Выручка</TableHeaderCell>
              <TableHeaderCell className="text-right">Начисления</TableHeaderCell>
              <TableHeaderCell className="text-right">Выплата</TableHeaderCell>
              <TableHeaderCell className="text-right">Фактический CPA</TableHeaderCell>
              <TableHeaderCell className="min-w-48">Split</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.rows.map((row) => (
              <TableRow key={row.campaign.id} className="border-t border-slate-100">
                <TableCell>
                  <div className="font-medium text-slate-900">{formatMarketingPartner(row.partner)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.referralLink.label || row.referralLink.code} · {row.partner.referralCode}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-slate-900">{row.campaign.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <code>{row.campaign.shortCode}</code>
                    <span className={row.campaign.isActive ? 'text-emerald-600' : 'text-slate-400'}>
                      {row.campaign.isActive ? 'Активна' : 'Неактивна'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="font-semibold">{formatMarketingCount(row.metrics.purchases)}</div>
                  <div className="text-xs text-slate-400">
                    {row.metrics.firstPurchases} первых / {row.metrics.repeatPurchases} повторных
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold">{formatMarketingMoney(row.metrics.revenue)}</TableCell>
                <TableCell className="text-right font-medium">{formatMarketingCount(row.metrics.rewardsCount)}</TableCell>
                <TableCell className="text-right font-semibold text-slate-900">{formatMarketingMoney(row.metrics.payout)}</TableCell>
                <TableCell className="text-right font-semibold text-blue-700">
                  {row.metrics.actualCpa === null ? '—' : formatMarketingMoney(row.metrics.actualCpa)}
                </TableCell>
                <TableCell>
                  {row.payoutModeSplit.length > 0 ? (
                    <div className="space-y-1 text-xs text-slate-600">
                      {row.payoutModeSplit.map((split) => (
                        <div key={split.payoutMode} className="flex justify-between gap-3">
                          <span>{PAYOUT_MODE_LABELS[split.payoutMode]}</span>
                          <span className="font-medium">{formatMarketingMoney(split.payout)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-xs text-slate-400">Нет ledger facts</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
