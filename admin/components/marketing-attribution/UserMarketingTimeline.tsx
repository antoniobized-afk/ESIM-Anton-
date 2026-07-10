'use client'

import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { marketingAttributionApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import type {
  MarketingRegistrationSnapshot,
  MarketingTimelineTouch,
  MarketingTouchChannel,
  MarketingUserTimeline,
} from '@/lib/types'

interface UserMarketingTimelineProps {
  userId: string
}

const channelLabels: Record<MarketingTouchChannel, string> = {
  WEB: 'Web',
  TELEGRAM_BOT: 'Telegram Bot',
  TELEGRAM_MINI_APP: 'Telegram Mini App',
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function TouchSummary({
  label,
  touch,
}: {
  label: string
  touch: MarketingTimelineTouch | MarketingRegistrationSnapshot | null
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium uppercase text-slate-400">{label}</div>
      {touch ? (
        <div className="mt-2 space-y-1 text-sm">
          <div className="font-medium text-slate-800">{touch.campaign.name || touch.campaign.shortCode || 'Кампания'}</div>
          <div className="text-slate-600">{channelLabels[touch.channel]} · {formatDate(touch.occurredAt)}</div>
          <div className="break-words text-xs text-slate-500">
            {touch.campaign.utmSource || '—'} / {touch.campaign.utmMedium || '—'} / {touch.campaign.utmCampaign || '—'}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-sm text-slate-500">Нет фактического касания</div>
      )}
    </div>
  )
}

export default function UserMarketingTimeline({ userId }: UserMarketingTimelineProps) {
  const [page, setPage] = useState(1)
  const [timeline, setTimeline] = useState<MarketingUserTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTimeline = useCallback(async (isCancelled?: () => boolean) => {
    try {
      setLoading(true)
      setError(null)
      setTimeline(null)
      const { data } = await marketingAttributionApi.getUserTimeline(userId, { page, limit: 10 })
      if (!isCancelled?.()) setTimeline(data)
    } catch (requestError) {
      if (!isCancelled?.()) {
        setError(getErrorMessage(requestError, 'Не удалось загрузить marketing timeline'))
      }
    } finally {
      if (!isCancelled?.()) setLoading(false)
    }
  }, [page, userId])

  useEffect(() => {
    let cancelled = false
    void loadTimeline(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [loadTimeline])

  if (loading && !timeline) {
    return <div className="mt-5 rounded-xl border border-slate-100 py-8"><Spinner centered /></div>
  }

  if (error && !timeline) {
    return (
      <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <Button className="mt-3" size="sm" variant="secondary" onClick={() => void loadTimeline()}>Повторить</Button>
      </div>
    )
  }

  if (!timeline) return null

  const registrationLabel = timeline.registration
    ? timeline.registration.status === 'ATTRIBUTED'
      ? `Attributed · ${formatDate(timeline.registration.finalizedAt)}`
      : timeline.registration.status === 'DIRECT'
        ? `Direct · ${formatDate(timeline.registration.finalizedAt)}`
        : 'Ожидает финализации'
    : 'Marketing state отсутствует'

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold text-slate-800">Marketing timeline</h5>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{registrationLabel}</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TouchSummary label="Current first touch" touch={timeline.current.first} />
        <TouchSummary label="Current last touch" touch={timeline.current.last} />
      </div>

      {timeline.registration?.status === 'ATTRIBUTED' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TouchSummary label="Registration first snapshot" touch={timeline.registration.first} />
          <TouchSummary label="Registration last snapshot" touch={timeline.registration.last} />
        </div>
      ) : null}

      <div className="mt-5">
        <div className="text-xs font-medium uppercase text-slate-400">История касаний</div>
        {timeline.touches.data.length > 0 ? (
          <ol className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {timeline.touches.data.map((touch) => (
              <li key={touch.id} className="flex flex-col gap-1 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{touch.campaign.name || touch.campaign.shortCode}</div>
                  <div className="truncate text-xs text-slate-500">
                    {touch.campaign.utmSource} / {touch.campaign.utmMedium} / {touch.campaign.utmCampaign}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-slate-500">
                  {channelLabels[touch.channel]} · {formatDate(touch.occurredAt)}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Фактических marketing touches нет.</p>
        )}
        <Pagination
          page={timeline.touches.meta.page}
          totalPages={timeline.touches.meta.totalPages}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
