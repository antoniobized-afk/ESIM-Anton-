'use client'

import { BarChart3, Link2, Users } from 'lucide-react'
import MarketingCampaignsPanel from './MarketingCampaignsPanel'
import MarketingReportsPanel from './MarketingReportsPanel'
import {
  type MarketingWorkspaceTab,
  useMarketingAttributionUrlState,
} from './useMarketingAttributionUrlState'

const tabs: Array<{
  id: MarketingWorkspaceTab
  label: string
  icon: typeof Link2
}> = [
  { id: 'campaigns', label: 'Кампании', icon: Link2 },
  { id: 'report', label: 'Отчёт по атрибуции', icon: BarChart3 },
  { id: 'cpa', label: 'Блогеры и CPA', icon: Users },
]

export default function MarketingAttributionWorkspace() {
  const urlState = useMarketingAttributionUrlState()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Источники трафика</h2>
        <p className="mt-1 text-sm text-slate-600">
          Campaign links, фактические касания и маркетинговая атрибуция.
        </p>
      </div>

      <div className="glass-card glass-card--static p-2">
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Разделы источников трафика">
          {tabs.map((item) => {
            const Icon = item.icon
            const active = urlState.tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => urlState.setTab(item.id)}
                className={[
                  'flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {urlState.tab === 'campaigns' ? (
        <MarketingCampaignsPanel
          page={urlState.page}
          status={urlState.status}
          onPageChange={urlState.setPage}
          onStatusChange={urlState.setStatus}
        />
      ) : (
        <MarketingReportsPanel
          kind={urlState.tab === 'report' ? 'attribution' : 'cpa'}
          filters={urlState.reportFilters}
          onFiltersChange={urlState.setReportFilters}
        />
      )}
    </div>
  )
}
