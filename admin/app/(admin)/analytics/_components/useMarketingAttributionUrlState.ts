'use client'

import { useCallback, useEffect, useMemo } from 'react'
import {
  getDefaultMarketingReportDateRange,
  isValidUtcDateOnly,
  MARKETING_ATTRIBUTION_DEFAULT_MODEL,
  MARKETING_ATTRIBUTION_MODELS,
  MARKETING_TOUCH_CHANNELS,
  type MarketingAttributionModel,
  type MarketingTouchChannel,
} from '@shared/marketing-attribution-report'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type {
  MarketingAttributionReportFilters,
} from '@/lib/marketing-attribution-report.types'

export type MarketingWorkspaceTab = 'campaigns' | 'report' | 'cpa'
export type MarketingCampaignStatusFilter = 'all' | 'active' | 'inactive'

const VALID_TABS = new Set<MarketingWorkspaceTab>(['campaigns', 'report', 'cpa'])
const VALID_STATUSES = new Set<MarketingCampaignStatusFilter>(['all', 'active', 'inactive'])
const VALID_MODELS = new Set<string>(MARKETING_ATTRIBUTION_MODELS)
const VALID_CHANNELS = new Set<string>(MARKETING_TOUCH_CHANNELS)

function normalizeTab(value: string | null): MarketingWorkspaceTab {
  return value && VALID_TABS.has(value as MarketingWorkspaceTab)
    ? (value as MarketingWorkspaceTab)
    : 'campaigns'
}

function normalizeStatus(value: string | null): MarketingCampaignStatusFilter {
  return value && VALID_STATUSES.has(value as MarketingCampaignStatusFilter)
    ? (value as MarketingCampaignStatusFilter)
    : 'all'
}

function normalizePage(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export function useMarketingAttributionUrlState() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = normalizeTab(searchParams.get('tab'))
  const status = normalizeStatus(searchParams.get('status'))
  const page = normalizePage(searchParams.get('page'))
  const defaults = getDefaultMarketingReportDateRange()
  const rawDateFrom = searchParams.get('from')
  const rawDateTo = searchParams.get('to')
  const hasValidDatePair = isValidUtcDateOnly(rawDateFrom) && isValidUtcDateOnly(rawDateTo)
  const dateFrom = hasValidDatePair ? rawDateFrom : defaults.dateFrom
  const dateTo = hasValidDatePair ? rawDateTo : defaults.dateTo
  const rawModel = searchParams.get('model')
  const model = rawModel && VALID_MODELS.has(rawModel as MarketingAttributionModel)
    ? rawModel as MarketingAttributionModel
    : MARKETING_ATTRIBUTION_DEFAULT_MODEL
  const rawChannel = searchParams.get('channel')
  const channel = rawChannel && VALID_CHANNELS.has(rawChannel as MarketingTouchChannel)
    ? rawChannel as MarketingTouchChannel
    : undefined

  const buildHref = useCallback((mutate: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString())
    mutate(next)
    const query = next.toString()
    return query ? `${pathname}?${query}` : pathname
  }, [pathname, searchParams])
  const replaceParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    router.replace(buildHref(mutate), { scroll: false })
  }, [buildHref, router])
  const pushParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    router.push(buildHref(mutate), { scroll: false })
  }, [buildHref, router])

  useEffect(() => {
    const rawTab = searchParams.get('tab')
    const rawStatus = searchParams.get('status')
    const rawPage = searchParams.get('page')
    const invalidTab = rawTab !== null && !VALID_TABS.has(rawTab as MarketingWorkspaceTab)
    const invalidStatus = rawStatus !== null && !VALID_STATUSES.has(rawStatus as MarketingCampaignStatusFilter)
    const invalidPage = rawPage !== null && normalizePage(rawPage) === 1 && rawPage !== '1'
    const invalidDatePair = (rawDateFrom !== null || rawDateTo !== null) && !hasValidDatePair
    const invalidModel = rawModel !== null && !VALID_MODELS.has(rawModel as MarketingAttributionModel)
    const invalidChannel = rawChannel !== null && !VALID_CHANNELS.has(rawChannel as MarketingTouchChannel)
    const redundantDefaults = rawTab === 'campaigns' || rawStatus === 'all' || rawPage === '1'
      || rawModel === MARKETING_ATTRIBUTION_DEFAULT_MODEL
      || (rawDateFrom === defaults.dateFrom && rawDateTo === defaults.dateTo)

    if (
      !invalidTab && !invalidStatus && !invalidPage && !invalidDatePair
      && !invalidModel && !invalidChannel && !redundantDefaults
    ) return

    replaceParams((next) => {
      if (invalidTab || next.get('tab') === 'campaigns') next.delete('tab')
      if (invalidStatus || next.get('status') === 'all') next.delete('status')
      if (invalidPage || next.get('page') === '1') next.delete('page')
      if (invalidDatePair || (
        next.get('from') === defaults.dateFrom && next.get('to') === defaults.dateTo
      )) {
        next.delete('from')
        next.delete('to')
      }
      if (invalidModel || next.get('model') === MARKETING_ATTRIBUTION_DEFAULT_MODEL) next.delete('model')
      if (invalidChannel) next.delete('channel')
    })
  }, [
    defaults.dateFrom,
    defaults.dateTo,
    hasValidDatePair,
    rawChannel,
    rawDateFrom,
    rawDateTo,
    rawModel,
    replaceParams,
    searchParams,
  ])

  const reportFilters = useMemo<MarketingAttributionReportFilters>(() => ({
    dateFrom,
    dateTo,
    model,
    channel,
  }), [channel, dateFrom, dateTo, model])

  return {
    tab,
    status,
    page,
    reportFilters,
    setTab: (value: MarketingWorkspaceTab) => pushParams((next) => {
      if (value === 'campaigns') next.delete('tab')
      else next.set('tab', value)
      next.delete('page')
    }),
    setStatus: (value: MarketingCampaignStatusFilter) => pushParams((next) => {
      if (value === 'all') next.delete('status')
      else next.set('status', value)
      next.delete('page')
    }),
    setPage: (value: number) => pushParams((next) => {
      if (value > 1) next.set('page', String(value))
      else next.delete('page')
    }),
    setReportFilters: (value: MarketingAttributionReportFilters) => pushParams((next) => {
      const currentDefaults = getDefaultMarketingReportDateRange()
      if (value.dateFrom === currentDefaults.dateFrom && value.dateTo === currentDefaults.dateTo) {
        next.delete('from')
        next.delete('to')
      } else {
        next.set('from', value.dateFrom)
        next.set('to', value.dateTo)
      }
      if (value.model === MARKETING_ATTRIBUTION_DEFAULT_MODEL) next.delete('model')
      else next.set('model', value.model)
      if (value.channel) next.set('channel', value.channel)
      else next.delete('channel')
      next.delete('page')
    }),
  }
}
