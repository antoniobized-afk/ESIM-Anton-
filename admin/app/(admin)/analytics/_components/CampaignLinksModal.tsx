'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import QRCode from 'qrcode'
import { Copy } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import type { MarketingCampaign } from '@/lib/types'

type LinkKind = keyof MarketingCampaign['links']

const linkKinds: Array<{ id: LinkKind; label: string }> = [
  { id: 'web', label: 'Web' },
  { id: 'telegramBot', label: 'Telegram Bot' },
  { id: 'telegramMiniApp', label: 'Mini App' },
]

interface CampaignLinksModalProps {
  campaign: MarketingCampaign
  onClose: () => void
  onCopy: (value: string) => void
}

export default function CampaignLinksModal({ campaign, onClose, onCopy }: CampaignLinksModalProps) {
  const [kind, setKind] = useState<LinkKind>('web')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)
  const selectedUrl = useMemo(() => campaign.links[kind], [campaign.links, kind])

  useEffect(() => {
    let cancelled = false
    setQrDataUrl(null)
    setQrError(false)

    if (!campaign.isActive) {
      return () => {
        cancelled = true
      }
    }

    void QRCode.toDataURL(selectedUrl, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
      .then((value) => {
        if (!cancelled) setQrDataUrl(value)
      })
      .catch(() => {
        if (!cancelled) setQrError(true)
      })

    return () => {
      cancelled = true
    }
  }, [campaign.isActive, selectedUrl])

  return (
    <Modal
      title={`Ссылки · ${campaign.name}`}
      description={campaign.isActive ? 'QR строится локально из URL, возвращённого backend.' : 'Кампания неактивна: распространение ссылок отключено.'}
      onClose={onClose}
      contentClassName="max-w-2xl !bg-white"
      footer={<Button variant="ghost" onClick={onClose}>Закрыть</Button>}
    >
      <div className="flex flex-wrap gap-2">
        {linkKinds.map((item) => (
          <Button key={item.id} size="sm" variant={kind === item.id ? 'primary' : 'secondary'} onClick={() => setKind(item.id)}>
            {item.label}
          </Button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr,240px] sm:items-start">
        <div className="min-w-0">
          <div className="break-all rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{selectedUrl}</div>
          <Button className="mt-3" variant="secondary" onClick={() => onCopy(selectedUrl)} disabled={!campaign.isActive}>
            <Copy className="h-4 w-4" />
            Скопировать ссылку
          </Button>
          {!campaign.isActive ? (
            <p className="mt-2 text-xs text-amber-700">Сначала активируйте кампанию.</p>
          ) : null}
        </div>

        <div className="flex min-h-60 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
          {qrDataUrl ? (
            <Image unoptimized src={qrDataUrl} width={240} height={240} alt={`QR-код для ${kind}`} />
          ) : !campaign.isActive ? (
            <p className="px-4 text-center text-sm text-amber-700">QR недоступен для неактивной кампании</p>
          ) : qrError ? (
            <p className="px-4 text-center text-sm text-red-600">Не удалось построить QR-код</p>
          ) : (
            <p className="text-sm text-slate-400">Формирование QR…</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
