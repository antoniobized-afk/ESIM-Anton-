'use client'

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import type { AdminReferralLink, CreateMarketingCampaignDto } from '@/lib/types'

interface CampaignFormModalProps {
  referralLinks: AdminReferralLink[]
  referralLinksLoading: boolean
  hasMoreReferralLinks: boolean
  saving: boolean
  onLoadMoreReferralLinks: () => void
  onClose: () => void
  onSubmit: (data: CreateMarketingCampaignDto) => Promise<void>
}

const inputClassName =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

function optionalText(value: string) {
  const normalized = value.trim()
  return normalized || undefined
}

export default function CampaignFormModal({
  referralLinks,
  referralLinksLoading,
  hasMoreReferralLinks,
  saving,
  onLoadMoreReferralLinks,
  onClose,
  onSubmit,
}: CampaignFormModalProps) {
  const [name, setName] = useState('')
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [utmContent, setUtmContent] = useState('')
  const [utmTerm, setUtmTerm] = useState('')
  const [targetPath, setTargetPath] = useState('/')
  const [referralLinkId, setReferralLinkId] = useState('')

  const selectedReferral = useMemo(
    () => referralLinks.find((link) => link.id === referralLinkId) ?? null,
    [referralLinkId, referralLinks],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit({
      name: name.trim(),
      utmSource: utmSource.trim(),
      utmMedium: utmMedium.trim(),
      utmCampaign: utmCampaign.trim(),
      utmContent: optionalText(utmContent),
      utmTerm: optionalText(utmTerm),
      targetPath: targetPath.trim(),
      referralLinkId: referralLinkId || undefined,
    })
  }

  return (
    <Modal
      title="Новая маркетинговая кампания"
      description="Canonical links и short code сгенерирует backend."
      onClose={onClose}
      contentClassName="max-w-3xl !bg-white"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button type="submit" form="marketing-campaign-form" disabled={saving}>
            {saving ? 'Создание…' : 'Создать кампанию'}
          </Button>
        </>
      )}
    >
      <form id="marketing-campaign-form" onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-medium text-slate-700">
          Название
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClassName}
            placeholder="Летняя кампания — блогер Иван"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            UTM source
            <input required maxLength={160} value={utmSource} onChange={(event) => setUtmSource(event.target.value)} className={inputClassName} placeholder="blogger" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            UTM medium
            <input required maxLength={160} value={utmMedium} onChange={(event) => setUtmMedium(event.target.value)} className={inputClassName} placeholder="social" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            UTM campaign
            <input required maxLength={160} value={utmCampaign} onChange={(event) => setUtmCampaign(event.target.value)} className={inputClassName} placeholder="summer-2026" />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            UTM content <span className="font-normal text-slate-400">(необязательно)</span>
            <input maxLength={160} value={utmContent} onChange={(event) => setUtmContent(event.target.value)} className={inputClassName} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            UTM term <span className="font-normal text-slate-400">(необязательно)</span>
            <input maxLength={160} value={utmTerm} onChange={(event) => setUtmTerm(event.target.value)} className={inputClassName} />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Относительный target path
          <input required maxLength={512} value={targetPath} onChange={(event) => setTargetPath(event.target.value)} className={inputClassName} placeholder="/catalog" />
          <span className="mt-1 block text-xs text-slate-400">Только путь внутри приложения, например /catalog?region=eu.</span>
        </label>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-medium text-slate-700">
            Партнёрская ссылка <span className="font-normal text-slate-400">(необязательно)</span>
            <select
              value={referralLinkId}
              onChange={(event) => setReferralLinkId(event.target.value)}
              className={inputClassName}
              disabled={referralLinksLoading && referralLinks.length === 0}
            >
              <option value="">Без партнёрской ссылки</option>
              {referralLinks.map((link) => (
                <option key={link.id} value={link.id}>
                  {link.label || link.code} · {link.code}
                </option>
              ))}
            </select>
          </label>

          {hasMoreReferralLinks ? (
            <Button className="mt-3" size="sm" variant="secondary" onClick={onLoadMoreReferralLinks} disabled={referralLinksLoading}>
              {referralLinksLoading ? 'Загрузка…' : 'Показать ещё ссылки'}
            </Button>
          ) : null}

          {selectedReferral ? (
            <div className="mt-3 text-xs text-slate-600">
              Политика только для чтения: бонус {String(selectedReferral.bonusPercent)}%, режим{' '}
              {selectedReferral.payoutMode === 'EXTERNAL' ? 'внешняя выплата' : 'баланс'}, промокод{' '}
              {selectedReferral.promoCode?.code || 'не связан'}.
            </div>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            Изменение партнёрской и promo-политики выполняется в{' '}
            <Link href="/referral-links" className="font-medium text-blue-600 hover:underline">Партнёрских ссылках</Link>.
          </p>
        </div>
      </form>
    </Modal>
  )
}
