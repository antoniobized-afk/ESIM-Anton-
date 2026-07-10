'use client'

import { useEffect, useState } from 'react'
import {
  MARKETING_ATTRIBUTION_MODEL_LABELS,
  MARKETING_ATTRIBUTION_MODELS,
  MARKETING_REPORT_MAX_RANGE_DAYS,
  MARKETING_TOUCH_CHANNEL_LABELS,
  MARKETING_TOUCH_CHANNELS,
  parseUtcDateOnly,
  type MarketingAttributionModel,
  type MarketingTouchChannel,
} from '@shared/marketing-attribution-report'
import { Download, Filter } from 'lucide-react'
import Button from '@/components/ui/Button'
import type {
  MarketingAttributionReportFilters,
} from '@/lib/marketing-attribution-report.types'

interface MarketingReportFiltersProps {
  filters: MarketingAttributionReportFilters
  exporting: boolean
  onApply: (filters: MarketingAttributionReportFilters) => void
  onExport: () => void
}

const inputClassName = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

export default function MarketingReportFilters({
  filters,
  exporting,
  onApply,
  onExport,
}: MarketingReportFiltersProps) {
  const [draft, setDraft] = useState(filters)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(filters)
    setValidationError(null)
  }, [filters])

  const apply = () => {
    const from = parseUtcDateOnly(draft.dateFrom)
    const to = parseUtcDateOnly(draft.dateTo)
    if (!from || !to) {
      setValidationError('Укажите корректные даты периода.')
      return
    }
    if (from > to) {
      setValidationError('Дата начала не может быть позже даты окончания.')
      return
    }
    const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1
    if (days > MARKETING_REPORT_MAX_RANGE_DAYS) {
      setValidationError(`Период не может превышать ${MARKETING_REPORT_MAX_RANGE_DAYS} дней.`)
      return
    }

    setValidationError(null)
    onApply(draft)
  }

  return (
    <div className="glass-card glass-card--static p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            Период с
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))}
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            Период по
            <input
              type="date"
              value={draft.dateTo}
              onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))}
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            Модель атрибуции
            <select
              value={draft.model}
              onChange={(event) => setDraft((current) => ({
                ...current,
                model: event.target.value as MarketingAttributionModel,
              }))}
              className={inputClassName}
            >
              {MARKETING_ATTRIBUTION_MODELS.map((model) => (
                <option key={model} value={model}>
                  {MARKETING_ATTRIBUTION_MODEL_LABELS[model]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            Канал
            <select
              value={draft.channel ?? ''}
              onChange={(event) => setDraft((current) => ({
                ...current,
                channel: event.target.value
                  ? event.target.value as MarketingTouchChannel
                  : undefined,
              }))}
              className={inputClassName}
            >
              <option value="">Все каналы</option>
              {MARKETING_TOUCH_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {MARKETING_TOUCH_CHANNEL_LABELS[channel]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={apply}>
            <Filter className="h-4 w-4" />
            Применить
          </Button>
          <Button onClick={onExport} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? 'Формируем…' : 'Скачать XLSX'}
          </Button>
        </div>
      </div>
      {validationError ? <p className="mt-3 text-sm text-red-600">{validationError}</p> : null}
    </div>
  )
}
