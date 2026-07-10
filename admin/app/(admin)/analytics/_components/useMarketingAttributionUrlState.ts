'use client'

import { useCallback, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type MarketingWorkspaceTab = 'campaigns' | 'report' | 'cpa'
export type MarketingCampaignStatusFilter = 'all' | 'active' | 'inactive'

const VALID_TABS = new Set<MarketingWorkspaceTab>(['campaigns', 'report', 'cpa'])
const VALID_STATUSES = new Set<MarketingCampaignStatusFilter>(['all', 'active', 'inactive'])

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

  const replaceParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString())
    mutate(next)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    const rawTab = searchParams.get('tab')
    const rawStatus = searchParams.get('status')
    const rawPage = searchParams.get('page')
    const invalidTab = rawTab !== null && !VALID_TABS.has(rawTab as MarketingWorkspaceTab)
    const invalidStatus = rawStatus !== null && !VALID_STATUSES.has(rawStatus as MarketingCampaignStatusFilter)
    const invalidPage = rawPage !== null && normalizePage(rawPage) === 1 && rawPage !== '1'
    const redundantDefaults = rawTab === 'campaigns' || rawStatus === 'all' || rawPage === '1'

    if (!invalidTab && !invalidStatus && !invalidPage && !redundantDefaults) return

    replaceParams((next) => {
      if (invalidTab || next.get('tab') === 'campaigns') next.delete('tab')
      if (invalidStatus || next.get('status') === 'all') next.delete('status')
      if (invalidPage || next.get('page') === '1') next.delete('page')
    })
  }, [replaceParams, searchParams])

  return {
    tab,
    status,
    page,
    setTab: (value: MarketingWorkspaceTab) => replaceParams((next) => {
      if (value === 'campaigns') next.delete('tab')
      else next.set('tab', value)
      next.delete('page')
    }),
    setStatus: (value: MarketingCampaignStatusFilter) => replaceParams((next) => {
      if (value === 'all') next.delete('status')
      else next.set('status', value)
      next.delete('page')
    }),
    setPage: (value: number) => replaceParams((next) => {
      if (value > 1) next.set('page', String(value))
      else next.delete('page')
    }),
  }
}
