'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { QrCode, Copy, CheckCircle, Download, Info } from '@/components/icons'
import BackHeader from '@/components/BackHeader'
import { ordersApi, type Order } from '@/lib/api'
import { getFlagUrl, getCountryName } from '@/lib/utils'
import type { UserOrderStatus } from '@shared/contracts/user-order'

type StatusBadge = {
  label: string
  class: string
  icon: string
}

const STATUS_BADGES = {
  PENDING: { label: 'Ожидает оплаты', class: 'badge-warning', icon: '⏳' },
  PAID: { label: 'Оплачен', class: 'badge-info', icon: '✅' },
  PROCESSING: { label: 'Обработка', class: 'badge-info', icon: '⚙️' },
  COMPLETED: { label: 'Выполнен', class: 'badge-success', icon: '🎉' },
  FAILED: { label: 'Ошибка', class: 'badge-error', icon: '❌' },
  REFUNDED: { label: 'Возврат', class: 'badge-warning', icon: '💰' },
  CANCELLED: { label: 'Отменён', class: 'badge-error', icon: '🚫' },
} satisfies Record<UserOrderStatus, StatusBadge>

function getStatusBadge(status: UserOrderStatus): StatusBadge {
  return STATUS_BADGES[status] ?? { label: status, class: 'badge-info', icon: '📦' }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-secondary">{label}</span>
      <span className="text-right font-semibold text-primary">{value}</span>
    </div>
  )
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
  ariaLabel,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  ariaLabel: string
}) {
  return (
    <div>
      <p className="mb-1 text-sm text-secondary">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm text-primary">
          {value}
        </code>
        <button
          onClick={onCopy}
          className="shrink-0 rounded-xl bg-orange-50 dark:bg-orange-900/30 p-3 text-[#f77430] transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/50"
          aria-label={ariaLabel}
        >
          {copied ? <CheckCircle size={20} /> : <Copy size={20} />}
        </button>
      </div>
    </div>
  )
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  const loadOrder = useCallback(async () => {
    try {
      const data = await ordersApi.getById(params.id as string)
      setOrder(data)
      setLoading(false)
    } catch (error) {
      console.error('Ошибка загрузки заказа:', error)
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    if (params.id) {
      void loadOrder()
    }
  }, [params.id, loadOrder])

  useEffect(() => {
    if (!order) return
    if (!['PENDING', 'PAID', 'PROCESSING'].includes(order.status)) return

    const interval = window.setInterval(() => {
      void loadOrder()
    }, 5000)

    return () => window.clearInterval(interval)
  }, [order, loadOrder])

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch (error) {
      console.error('Ошибка копирования:', error)
    }
  }

  if (loading) {
    return (
      <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
        <div className="mt-6 flex flex-col gap-4">
          <div className="skeleton h-8 w-32" />
          <div className="skeleton h-64 w-full" />
          <div className="skeleton h-32 w-full" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
        <div className="glass-card mt-6 py-12 text-center">
          <p className="text-secondary">Заказ не найден</p>
          <button onClick={() => router.push('/orders')} className="glass-button mx-auto mt-4 max-w-xs">
            К моим заказам
          </button>
        </div>
      </div>
    )
  }

  const badge = getStatusBadge(order.status)
  const isCompleted = order.status === 'COMPLETED'
  const hasIssuedSnapshot = Boolean(order.qrCode || order.iccid || order.activationCode)
  const canShowEsimData = isCompleted || (order.status === 'PROCESSING' && hasIssuedSnapshot)
  const formattedDate = new Date(order.createdAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const flagUrl = getFlagUrl(order.product.country)
  const countryName = getCountryName(order.product.country)

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
      <BackHeader title="Заказ" fallbackRoute="/my-esim" className="mb-6" />

      <div className="card-neutral p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
            {flagUrl ? (
              <img
                src={flagUrl}
                alt={countryName}
                className="h-7 w-10 rounded-sm object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.src = '/logo-mark.png'
                  target.className = 'w-9 h-9 rounded-lg object-contain'
                }}
              />
            ) : (
              <img src="/logo-mark.png" alt="Mojo mobile" className="h-9 w-9 rounded-lg object-contain" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-bold text-primary">Заказ #{order.id.slice(0, 8)}</h1>
              <span className={`badge ${badge.class} shrink-0`}>{badge.label}</span>
            </div>
            <p className="mt-1 text-sm text-secondary">{countryName} • {order.product.name}</p>
            <p className="mt-1 text-xs text-muted">Создан {formattedDate}</p>
          </div>
        </div>
      </div>


      <div className="card-neutral mb-4 p-5 text-center animate-slide-up" style={{ animationDelay: '0.04s' }}>
        <div className="mb-3 text-5xl">{badge.icon}</div>
        <span className={`badge ${badge.class} text-base`}>{badge.label}</span>
        <p className="mt-2 text-sm text-secondary">{formattedDate}</p>
        {(order.status === 'PAID' || order.status === 'PROCESSING') && (
          <p className="mt-3 text-sm text-secondary">
            {order.status === 'PAID'
              ? 'Оплата подтверждена. Заказ поставлен в очередь на выпуск eSIM.'
              : 'Заказ обрабатывается. Страница обновляется автоматически.'}
          </p>
        )}
      </div>

      {canShowEsimData && order.qrCode && (
        <div className="card-neutral mb-4 p-5 text-center animate-slide-up" style={{ animationDelay: '0.04s' }}>
          <h3 className="mb-3 flex items-center justify-center gap-2 font-bold text-primary">
            <QrCode size={20} />
            QR-код для активации
          </h3>
          <div className="mb-3 inline-block rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
            <img src={order.qrCode} alt="QR Code" className="mx-auto h-64 w-64" />
          </div>
          <p className="mb-4 text-sm text-secondary">
            {isCompleted
              ? 'Отсканируйте этот QR-код в настройках вашего телефона для активации eSIM'
              : 'Данные eSIM уже получены от провайдера. Локальная финализация заказа ещё завершается.'}
          </p>
          <button
            onClick={() => {
              const tg = (window as any).Telegram?.WebApp
              if (tg?.openLink) {
                tg.openLink(order.qrCode!)
              } else {
                window.open(order.qrCode!, '_blank')
              }
            }}
            className="glass-button-secondary mx-auto inline-flex w-auto items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold"
          >
            <Download size={16} />
            Скачать QR-код
          </button>
        </div>
      )}

      {canShowEsimData && (order.iccid || order.activationCode) && (
        <div className="card-neutral mb-4 p-5 animate-slide-up" style={{ animationDelay: '0.08s' }}>
          <h3 className="mb-3 font-bold text-primary">Данные eSIM</h3>
          <div className="flex flex-col gap-3">
            {order.iccid && (
              <CopyField
                label="ICCID"
                value={order.iccid}
                copied={copied === 'ICCID'}
                onCopy={() => copyToClipboard(order.iccid!, 'ICCID')}
                ariaLabel="Скопировать ICCID"
              />
            )}
            {order.activationCode && (
              <CopyField
                label="Код активации"
                value={order.activationCode}
                copied={copied === 'код'}
                onCopy={() => copyToClipboard(order.activationCode!, 'код')}
                ariaLabel="Скопировать код активации"
              />
            )}
          </div>
        </div>
      )}

      <div className="card-neutral mb-4 p-5 animate-slide-up" style={{ animationDelay: '0.12s' }}>
        <h3 className="mb-3 font-bold text-primary">Информация о товаре</h3>
        <div className="flex flex-col gap-3">
          <DetailRow label="Страна" value={countryName} />
          <DetailRow label="Тариф" value={order.product.name} />
          <DetailRow label="Данные" value={order.product.dataAmount} />
          <DetailRow label="Срок действия" value={`${order.product.validityDays} дней`} />
          <DetailRow label="Количество" value={String(order.quantity)} />
        </div>
      </div>

      <div className="card-neutral mb-4 p-5 animate-slide-up" style={{ animationDelay: '0.16s' }}>
        <h3 className="mb-3 font-bold text-primary">Стоимость</h3>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between">
            <span className="text-secondary">Цена товара</span>
            <span className="text-primary">₽{Number(order.productPrice).toFixed(2)}</span>
          </div>
          {Number(order.discount) > 0 && (
            <div className="flex justify-between text-[#f77430]">
              <span>Скидка</span>
              <span>-₽{Number(order.discount).toFixed(2)}</span>
            </div>
          )}
          {Number(order.bonusUsed) > 0 && (
            <div className="flex justify-between text-[#f77430]">
              <span>Бонусы</span>
              <span>-₽{Number(order.bonusUsed).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 text-lg font-bold">
            <span>Итого</span>
            <span className="text-[#f77430]">₽{Number(order.totalAmount).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {canShowEsimData && (
        <div className="card-neutral border border-amber-200 bg-amber-50 p-5 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex gap-3">
            <Info size={20} className="mt-1 shrink-0 text-amber-700" />
            <div>
              <h4 className="mb-2 font-semibold text-amber-900">Как активировать eSIM?</h4>
              <ol className="list-inside list-decimal [&>li+li]:mt-1 text-sm text-amber-800">
                <li>Откройте Настройки → Сотовая связь</li>
                <li>Нажмите &quot;Добавить eSIM&quot;</li>
                <li>Выберите &quot;Использовать QR-код&quot;</li>
                <li>Отсканируйте QR-код выше</li>
                <li>Следуйте инструкциям на экране</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
