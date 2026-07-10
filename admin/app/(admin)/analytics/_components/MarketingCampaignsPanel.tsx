'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Link2, Plus, Power } from 'lucide-react'
import Button from '@/components/ui/Button'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/ToastProvider'
import { getAdminRoleFromToken } from '@/lib/auth'
import { getErrorMessage } from '@/lib/errors'
import { marketingAttributionApi, referralLinksApi } from '@/lib/api'
import type {
  AdminReferralLink,
  AdminRole,
  CreateMarketingCampaignDto,
  MarketingCampaign,
  PaginationMeta,
} from '@/lib/types'
import CampaignFormModal from './CampaignFormModal'
import CampaignLinksModal from './CampaignLinksModal'
import type { MarketingCampaignStatusFilter } from './useMarketingAttributionUrlState'

interface MarketingCampaignsPanelProps {
  page: number
  status: MarketingCampaignStatusFilter
  onPageChange: (page: number) => void
  onStatusChange: (status: MarketingCampaignStatusFilter) => void
}

const statusOptions: Array<{ value: MarketingCampaignStatusFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'inactive', label: 'Неактивные' },
]

function statusParam(status: MarketingCampaignStatusFilter) {
  if (status === 'active') return true
  if (status === 'inactive') return false
  return undefined
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function MarketingCampaignsPanel({
  page,
  status,
  onPageChange,
  onStatusChange,
}: MarketingCampaignsPanelProps) {
  const toast = useToast()
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([])
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [linksCampaign, setLinksCampaign] = useState<MarketingCampaign | null>(null)
  const [changingCampaignId, setChangingCampaignId] = useState<string | null>(null)
  const [referralLinks, setReferralLinks] = useState<AdminReferralLink[]>([])
  const [referralMeta, setReferralMeta] = useState<PaginationMeta | null>(null)
  const [referralLinksLoading, setReferralLinksLoading] = useState(false)
  const campaignRequestIdRef = useRef(0)
  const canManage = adminRole === 'MANAGER' || adminRole === 'SUPER_ADMIN'

  useEffect(() => {
    setAdminRole(getAdminRoleFromToken())
  }, [])

  const loadCampaigns = useCallback(async () => {
    const requestId = ++campaignRequestIdRef.current
    try {
      setLoading(true)
      setError(null)
      const { data } = await marketingAttributionApi.getCampaigns({
        page,
        limit: 20,
        isActive: statusParam(status),
      })
      if (campaignRequestIdRef.current !== requestId) return
      setCampaigns(data.data)
      setMeta(data.meta)

      if (page > data.meta.totalPages) {
        onPageChange(data.meta.totalPages)
      }
    } catch (requestError) {
      if (campaignRequestIdRef.current !== requestId) return
      setError(getErrorMessage(requestError, 'Не удалось загрузить маркетинговые кампании'))
    } finally {
      if (campaignRequestIdRef.current === requestId) setLoading(false)
    }
  }, [onPageChange, page, status])

  useEffect(() => {
    void loadCampaigns()
    return () => {
      campaignRequestIdRef.current += 1
    }
  }, [loadCampaigns])

  const loadReferralLinks = useCallback(async (nextPage: number) => {
    try {
      setReferralLinksLoading(true)
      const { data } = await referralLinksApi.getAll({ page: nextPage, limit: 100, isActive: true })
      setReferralLinks((current) => {
        const byId = new Map(current.map((item) => [item.id, item]))
        data.data.forEach((item) => byId.set(item.id, item))
        return Array.from(byId.values())
      })
      setReferralMeta(data.meta)
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Не удалось загрузить партнёрские ссылки'))
    } finally {
      setReferralLinksLoading(false)
    }
  }, [toast])

  const openCreate = () => {
    setFormOpen(true)
    if (!referralMeta && !referralLinksLoading) void loadReferralLinks(1)
  }

  const createCampaign = async (data: CreateMarketingCampaignDto) => {
    try {
      setSaving(true)
      const response = await marketingAttributionApi.createCampaign(data)
      setFormOpen(false)
      setLinksCampaign(response.data)
      toast.success('Маркетинговая кампания создана')
      if (page === 1) await loadCampaigns()
      else onPageChange(1)
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Не удалось создать кампанию'))
    } finally {
      setSaving(false)
    }
  }

  const toggleCampaign = async (campaign: MarketingCampaign) => {
    const action = campaign.isActive ? 'деактивировать' : 'активировать'
    if (!window.confirm(`Вы уверены, что хотите ${action} кампанию «${campaign.name}»?`)) return

    try {
      setChangingCampaignId(campaign.id)
      const { data } = await marketingAttributionApi.updateCampaign(campaign.id, {
        isActive: !campaign.isActive,
      })
      setCampaigns((current) => current.map((item) => item.id === data.id ? data : item))
      toast.success(data.isActive ? 'Кампания активирована' : 'Кампания деактивирована')
      if (status !== 'all') await loadCampaigns()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Не удалось изменить статус кампании'))
    } finally {
      setChangingCampaignId(null)
    }
  }

  const copyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.info('Ссылка скопирована')
    } catch {
      toast.error('Не удалось скопировать ссылку')
    }
  }

  return (
    <section className="space-y-4">
      <div className="glass-card glass-card--static p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={status === option.value ? 'primary' : 'secondary'}
                onClick={() => onStatusChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Новая кампания
            </Button>
          ) : (
            <span className="text-sm text-slate-500">Режим просмотра: изменения доступны MANAGER и SUPER_ADMIN.</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-10"><Spinner centered /></div>
      ) : error ? (
        <div className="glass-card glass-card--static p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void loadCampaigns()}>Повторить</Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="glass-card glass-card--static p-8 text-center text-sm text-slate-600">
          Кампаний с выбранным статусом нет.
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="glass-card glass-card--static p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
                    <span className={[
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      campaign.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600',
                    ].join(' ')}>
                      {campaign.isActive ? 'Активна' : 'Неактивна'}
                    </span>
                    <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{campaign.shortCode}</code>
                  </div>

                  <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div><span className="text-slate-400">UTM:</span> <span className="text-slate-700">{campaign.utmSource} / {campaign.utmMedium} / {campaign.utmCampaign}</span></div>
                    <div><span className="text-slate-400">Путь:</span> <code className="break-all text-slate-700">{campaign.targetPath}</code></div>
                    <div>
                      <span className="text-slate-400">Партнёр:</span>{' '}
                      {campaign.referralLink ? (
                        <Link href="/referral-links" className="text-blue-600 hover:underline">
                          {campaign.referralLink.label || campaign.referralLink.code}
                          {!campaign.referralLink.isActive ? ' (неактивна)' : ''}
                        </Link>
                      ) : <span className="text-slate-700">не связан</span>}
                    </div>
                    <div><span className="text-slate-400">Создана:</span> <span className="text-slate-700">{formatDate(campaign.createdAt)}</span></div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setLinksCampaign(campaign)}>
                    <Link2 className="h-4 w-4" />
                    Ссылки и QR
                  </Button>
                  {campaign.referralLink ? (
                    <Link href="/referral-links" className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                      <ExternalLink className="h-4 w-4" />
                      Политика
                    </Link>
                  ) : null}
                  {canManage ? (
                    <Button
                      variant={campaign.isActive ? 'destructive' : 'secondary'}
                      size="sm"
                      disabled={changingCampaignId === campaign.id}
                      onClick={() => void toggleCampaign(campaign)}
                    >
                      <Power className="h-4 w-4" />
                      {campaign.isActive ? 'Деактивировать' : 'Активировать'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {meta ? <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={onPageChange} /> : null}

      {formOpen ? (
        <CampaignFormModal
          referralLinks={referralLinks}
          referralLinksLoading={referralLinksLoading}
          hasMoreReferralLinks={Boolean(referralMeta && referralMeta.page < referralMeta.totalPages)}
          saving={saving}
          onLoadMoreReferralLinks={() => void loadReferralLinks((referralMeta?.page ?? 0) + 1)}
          onClose={() => setFormOpen(false)}
          onSubmit={createCampaign}
        />
      ) : null}

      {linksCampaign ? (
        <CampaignLinksModal campaign={linksCampaign} onClose={() => setLinksCampaign(null)} onCopy={copyLink} />
      ) : null}
    </section>
  )
}
