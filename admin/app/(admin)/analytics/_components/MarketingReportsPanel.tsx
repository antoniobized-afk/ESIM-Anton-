'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getMarketingAttributionModelLabel,
  MARKETING_TOUCH_CHANNEL_LABELS,
} from '@shared/marketing-attribution-report'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/ToastProvider'
import { marketingAttributionApi } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/auth'
import {
  downloadBlob,
  getDownloadFilename,
  toDownloadBlob,
  XLSX_MIME_TYPE,
} from '@/lib/download'
import { getBlobErrorMessage, getErrorMessage } from '@/lib/errors'
import type {
  MarketingAttributionReport,
  MarketingAttributionReportFilters,
  MarketingCpaReport,
} from '@/lib/marketing-attribution-report.types'
import AttributionReportTable from './AttributionReportTable'
import CpaReportTable from './CpaReportTable'
import MarketingReportFilters from './MarketingReportFilters'
import {
  formatMarketingCount,
  formatMarketingMoney,
} from './marketing-report-formatting'

type LoadedReport =
  | { kind: 'attribution'; data: MarketingAttributionReport }
  | { kind: 'cpa'; data: MarketingCpaReport }

interface MarketingReportsPanelProps {
  kind: LoadedReport['kind']
  filters: MarketingAttributionReportFilters
  onFiltersChange: (filters: MarketingAttributionReportFilters) => void
}

export default function MarketingReportsPanel({
  kind,
  filters,
  onFiltersChange,
}: MarketingReportsPanelProps) {
  const toast = useToast()
  const [report, setReport] = useState<LoadedReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestGenerationRef = useRef(0)

  const loadReport = useCallback(async () => {
    const requestGeneration = ++requestGenerationRef.current

    try {
      setLoading(true)
      setError(null)
      if (kind === 'attribution') {
        const response = await marketingAttributionApi.getAttributionReport(filters)
        if (requestGeneration !== requestGenerationRef.current) return
        setReport({ kind, data: response.data })
      } else {
        const response = await marketingAttributionApi.getCpaReport(filters)
        if (requestGeneration !== requestGenerationRef.current) return
        setReport({ kind, data: response.data })
      }
    } catch (requestError) {
      if (requestGeneration !== requestGenerationRef.current) return
      if (isUnauthorizedError(requestError)) return
      setError(getErrorMessage(requestError, 'Не удалось загрузить отчёт'))
    } finally {
      if (requestGeneration === requestGenerationRef.current) setLoading(false)
    }
  }, [filters, kind])

  useEffect(() => {
    void loadReport()
    return () => {
      requestGenerationRef.current += 1
    }
  }, [loadReport])

  const exportReports = async () => {
    try {
      setExporting(true)
      const response = await marketingAttributionApi.exportReports(filters)
      const contentDisposition = response.headers['content-disposition']
      const filename = getDownloadFilename(
        typeof contentDisposition === 'string' ? contentDisposition : undefined,
        `marketing_attribution_${filters.dateFrom}_${filters.dateTo}.xlsx`,
      )
      const blob = toDownloadBlob(response.data, XLSX_MIME_TYPE)
      downloadBlob(blob, filename)
      toast.success('XLSX-отчёт сформирован')
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) return
      const message = await getBlobErrorMessage(requestError, 'Неизвестная ошибка')
      toast.error(`Не удалось выгрузить отчёт: ${message}`)
    } finally {
      setExporting(false)
    }
  }

  const visibleReport = report?.kind === kind ? report : null

  return (
    <section className="space-y-4" aria-busy={loading}>
      <MarketingReportFilters
        filters={filters}
        exporting={exporting}
        onApply={onFiltersChange}
        onExport={() => void exportReports()}
      />

      {loading ? (
        <div className="glass-card p-10"><Spinner centered /></div>
      ) : error ? (
        <div className="glass-card glass-card--static p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void loadReport()}>
            Повторить
          </Button>
        </div>
      ) : visibleReport ? (
        <>
          <ReportSummary report={visibleReport} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <div className="font-medium">
              UTC · {visibleReport.data.filters.dateFrom}—{visibleReport.data.filters.dateTo} ·{' '}
              {getMarketingAttributionModelLabel(visibleReport.data.filters.model)} ·{' '}
              {visibleReport.data.filters.channel
                ? MARKETING_TOUCH_CHANNEL_LABELS[visibleReport.data.filters.channel]
                : 'все каналы'}
            </div>
            <p className="mt-1 text-xs text-blue-700">{visibleReport.data.semantics.note}</p>
          </div>
          {visibleReport.kind === 'attribution'
            ? <AttributionReportTable report={visibleReport.data} />
            : <CpaReportTable report={visibleReport.data} />}
        </>
      ) : null}
    </section>
  )
}

function ReportSummary({ report }: { report: LoadedReport }) {
  if (report.kind === 'attribution') {
    const totals = report.data.totals
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Клики" value={formatMarketingCount(totals.clicks)} />
        <MetricCard label="Регистрации" value={formatMarketingCount(totals.registrations)} />
        <MetricCard label="Первые покупки" value={formatMarketingCount(totals.firstPurchases)} />
        <MetricCard label="Повторные покупки" value={formatMarketingCount(totals.repeatPurchases)} />
        <MetricCard label="Выручка" value={formatMarketingMoney(totals.revenue)} />
      </div>
    )
  }

  const totals = report.data.totals
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Покупки" value={formatMarketingCount(totals.purchases)} />
      <MetricCard label="Выручка" value={formatMarketingMoney(totals.revenue)} />
      <MetricCard label="Начисления" value={formatMarketingCount(totals.rewardsCount)} />
      <MetricCard label="Фактическая выплата" value={formatMarketingMoney(totals.payout)} />
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card glass-card--static p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
