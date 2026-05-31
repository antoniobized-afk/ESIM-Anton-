'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Smartphone, Plus, Wifi, WifiOff, RefreshCw, QrCode,
  Apple, Smartphone as AndroidIcon, Copy, Check, ChevronDown, ChevronUp, Clock,
} from '@/components/icons'
import BottomNav from '@/components/BottomNav'
import { getCountryEmoji, formatDataAmount } from '@/lib/utils'
import { ordersApi } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import BackHeader from '@/components/BackHeader'
import { buildEsimActivationLinks } from '@/lib/esim-links'
import { detectDevice } from '@/lib/device'

/**
 * Нормализованные статусы eSIM, которые приходят с бэка (см.
 * `backend/src/modules/esim-provider/esim-status.ts`). UI рендерит каждое из
 * этих состояний своим бейджом и поведением (например, кнопка «Пополнить»
 * скрыта для EXPIRED/USED_UP).
 */
type EsimUiStatus =
  | 'ACTIVE'
  | 'NOT_INSTALLED'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'USED_UP'
  | 'CANCELLED'
  | 'UNKNOWN'

interface MyEsim {
  id: string
  iccid: string
  country: string
  dataAmount: string
  orderStatus: 'PAID' | 'PROCESSING' | 'COMPLETED'
  qrCode?: string
  activationCode?: string
  smdpAddress?: string | null
  /** Реальный нормализованный статус с провайдера (или из БД-кэша). */
  status: EsimUiStatus
  /** Поддерживает ли тариф top-up — для скрытия кнопки «Пополнить». */
  canTopup: boolean
  /** Снимок даты истечения, нужен для прогрессбара срока. */
  activatedAt?: string | null
  expiresAt?: string | null
  /** Реальный расход трафика, обновляется через /usage. */
  usage?: {
    available: boolean
    reason?: string
    stale?: boolean
    usedBytes: number | null
    totalBytes: number | null
    remainingBytes: number | null
    percentTraffic: number | null
    percentTime: number | null
    validityDaysLeft: number | null
    validityHoursLeft: number | null
  }
  refreshing?: boolean
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<void> {
  const queue = [...tasks]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()
      if (!next) return
      try { await next() } catch { /* перехвачено внутри задачи */ }
    }
  })
  await Promise.all(workers)
}

const USAGE_CONCURRENCY = 5

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} ГБ`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} МБ`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${bytes} Б`
}

function normalizeStatus(raw?: string | null): EsimUiStatus {
  const v = String(raw || '').toUpperCase()
  if (v === 'ACTIVE' || v === 'NOT_INSTALLED' || v === 'SUSPENDED' || v === 'EXPIRED' || v === 'USED_UP' || v === 'CANCELLED') {
    return v as EsimUiStatus
  }
  return 'UNKNOWN'
}

function getStatusConfig(status: EsimUiStatus) {
  const configs: Record<EsimUiStatus, { label: string; icon: any; color: string; bg: string }> = {
    ACTIVE: {
      label: 'Активна', icon: Wifi,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/30',
    },
    NOT_INSTALLED: {
      label: 'Не активирована', icon: QrCode,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    SUSPENDED: {
      label: 'Приостановлена', icon: WifiOff,
      color: 'text-amber-700 dark:text-amber-300',
      bg: 'bg-amber-100 dark:bg-amber-900/30',
    },
    EXPIRED: {
      label: 'Истёк срок', icon: WifiOff,
      color: 'text-gray-500',
      bg: 'bg-gray-100 dark:bg-gray-700',
    },
    USED_UP: {
      label: 'Трафик исчерпан', icon: WifiOff,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-900/30',
    },
    CANCELLED: {
      label: 'Отменена', icon: WifiOff,
      color: 'text-gray-500',
      bg: 'bg-gray-100 dark:bg-gray-700',
    },
    UNKNOWN: {
      label: 'Статус неизвестен', icon: RefreshCw,
      color: 'text-gray-500',
      bg: 'bg-gray-100 dark:bg-gray-700',
    },
  }
  return configs[status]
}

function progressColor(p: number | null | undefined): string {
  if (p === null || p === undefined) return 'bg-gray-300'
  if (p <= 10) return 'bg-red-500'
  if (p <= 30) return 'bg-amber-500'
  return 'bg-[#2563eb]'
}

/** Кнопки активации + раскрывающаяся инструкция. Рендерится под QR. */
function ActivationBlock({
  smdp,
  ac,
  iccid,
}: {
  smdp?: string | null
  ac?: string | null
  iccid: string
}) {
  const [copied, setCopied] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showAltButton, setShowAltButton] = useState(false)
  const links = buildEsimActivationLinks(smdp, ac)
  const device = useMemo(() => detectDevice(), [])

  if (!links.lpa) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Код активации появится после выдачи eSIM
      </p>
    )
  }

  const copyLpa = async () => {
    try {
      await navigator.clipboard.writeText(links.lpa!)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // На некоторых in-app браузерах clipboard может быть недоступен —
      // показываем prompt как fallback
      window.prompt('Скопируйте LPA-код:', links.lpa!)
    }
  }

  const handleOpenLink = (e: React.MouseEvent<HTMLAnchorElement>, url: string, isAndroid: boolean) => {
    e.preventDefault()
    if (isAndroid) {
      void copyLpa() // Асинхронное копирование в фоне (без блокировки)
    }

    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openLink) {
      // API Telegram для принудительного открытия ссылки ВО ВНЕШНЕМ обработчике (настройки ОС)
      try {
        (window as any).Telegram.WebApp.openLink(url, { try_instant_view: false })
      } catch (err) {
        window.location.href = url
      }
    } else {
      window.location.href = url
    }
  }

  /** Кнопка iPhone (полноразмерная, акцентная) */
  const appleButtonPrimary = links.appleUniversalLink && (
    <a
      href={links.appleUniversalLink}
      className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
    >
      <Apple size={18} />
      Установить на iPhone
    </a>
  )

  /** Кнопка Android (полноразмерная, акцентная) */
  const androidButtonPrimary = links.androidUniversalLink && (
    <a
      href={links.androidUniversalLink}
      onClick={(e) => handleOpenLink(e, links.androidUniversalLink!, true)}
      className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
    >
      <AndroidIcon size={18} />
      Установить на Android
    </a>
  )

  /** Кнопка iPhone (вторичная, компактная в grid) */
  const appleButtonSecondary = links.appleUniversalLink && (
    <a
      href={links.appleUniversalLink}
      className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
    >
      <Apple size={16} />
      iPhone
    </a>
  )

  /** Кнопка Android (вторичная, компактная в grid) */
  const androidButtonSecondary = links.androidUniversalLink && (
    <a
      href={links.androidUniversalLink}
      onClick={(e) => handleOpenLink(e, links.androidUniversalLink!, true)}
      className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
    >
      <AndroidIcon size={16} />
      Android
    </a>
  )

  /**
   * На мобильном — показываем кнопку под своё устройство + ссылку «Другое устройство?»
   * На десктопе — показываем обе кнопки в grid (как раньше)
   */
  const renderButtons = () => {
    if (device === 'ios') {
      return (
        <>
          {appleButtonPrimary}
          {links.androidUniversalLink && (
            showAltButton ? (
              androidButtonSecondary
            ) : (
              <button
                type="button"
                onClick={() => setShowAltButton(true)}
                className="w-full text-center text-xs text-gray-400 dark:text-gray-500 hover:text-[#f77430] transition-colors"
              >
                У меня Android →
              </button>
            )
          )}
        </>
      )
    }

    if (device === 'android') {
      return (
        <>
          {androidButtonPrimary}
          {links.appleUniversalLink && (
            showAltButton ? (
              appleButtonSecondary
            ) : (
              <button
                type="button"
                onClick={() => setShowAltButton(true)}
                className="w-full text-center text-xs text-gray-400 dark:text-gray-500 hover:text-[#f77430] transition-colors"
              >
                У меня iPhone →
              </button>
            )
          )}
        </>
      )
    }

    // Desktop — обе кнопки в grid
    return (
      <div className="grid grid-cols-2 gap-2">
        {links.appleUniversalLink && (
          <a
            href={links.appleUniversalLink}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Apple size={18} />
            iPhone
          </a>
        )}
        {links.androidUniversalLink && (
          <a
            href={links.androidUniversalLink}
            onClick={(e) => handleOpenLink(e, links.androidUniversalLink!, true)}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <AndroidIcon size={18} />
            Android
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Установка eSIM</p>
      {renderButtons()}
      <button
        type="button"
        onClick={copyLpa}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl text-sm font-medium transition-colors"
      >
        {copied ? <><Check size={16} /> Скопировано</> : <><Copy size={16} /> Скопировать LPA-код</>}
      </button>
      <button
        type="button"
        onClick={() => setShowInstructions((v) => !v)}
        className="w-full flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-[#f77430] transition-colors"
      >
        Инструкция вручную {showInstructions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showInstructions && (
        <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 flex flex-col gap-1.5">
          <p className="font-medium">Если кнопки не открыли установку:</p>
          {device === 'android' ? (
            <>
              <p><b>Android:</b> Настройки → Сеть и интернет → SIM-карты → Добавить eSIM → «Нет QR-кода?» → «Ввести вручную». Вставьте LPA-код выше.</p>
              <p><b>iPhone:</b> Настройки → Сотовая связь → Добавить eSIM → «Использовать QR-код» → «Ввести данные вручную». Вставьте LPA-код выше.</p>
            </>
          ) : (
            <>
              <p><b>iPhone:</b> Настройки → Сотовая связь → Добавить eSIM → «Использовать QR-код» → «Ввести данные вручную». Вставьте LPA-код выше.</p>
              <p><b>Android:</b> Настройки → Сеть и интернет → SIM-карты → Добавить eSIM → «Нет QR-кода?» → «Ввести вручную». Вставьте LPA-код выше.</p>
            </>
          )}
          <p className="text-gray-400 mt-2">ICCID: <code>{iccid}</code></p>
        </div>
      )}
    </div>
  )
}

export default function MyEsimPage() {
  const router = useRouter()

  const { user: authUser, isLoading: authLoading } = useAuth()
  const [esims, setEsims] = useState<MyEsim[]>([])
  const [loading, setLoading] = useState(true)

  const loadEsims = useCallback(async () => {
    try {
      let userId: string | null = authUser?.id || null

      if (!userId) {
        const { getToken } = await import('@/lib/auth')
        const token = getToken()
        if (token) {
          const { api } = await import('@/lib/api')
          const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          userId = data.id
        } else {
          window.location.href = '/login'
          return
        }
      }

      if (!userId) { setLoading(false); return }
      const orders = await ordersApi.getMy(userId);

      const activeOrders = orders.filter(o =>
        o.status === 'PAID' || o.status === 'PROCESSING' || o.status === 'COMPLETED'
      );

      const mappedEsims: MyEsim[] = activeOrders.map(order => ({
        id: order.id,
        iccid: order.iccid || 'Ожидает генерации...',
        country: order.product.country,
        dataAmount: formatDataAmount(order.product.dataAmount),
        orderStatus: order.status as 'PAID' | 'PROCESSING' | 'COMPLETED',
        qrCode: order.qrCode,
        activationCode: order.activationCode,
        smdpAddress: order.smdpAddress ?? null,
        status: normalizeStatus(order.esimStatus),
        canTopup: order.product.supportTopup !== false,
        activatedAt: order.activatedAt ?? null,
        expiresAt: order.expiresAt ?? null,
      }));

      setEsims(mappedEsims);

      const candidates = mappedEsims.filter(
        (e) => e.iccid && !e.iccid.startsWith('Ожидает'),
      )
      const tasks = candidates.map((esim) => () => fetchUsageInto(esim.id))
      await runWithConcurrency(tasks, USAGE_CONCURRENCY)
    } catch (error) {
      console.error('Ошибка загрузки eSIM:', error);
    } finally {
      setLoading(false);
    }
  }, [authUser?.id])

  useEffect(() => {
    if (authLoading) return
    void loadEsims()
  }, [authLoading, loadEsims])

  const fetchUsageInto = async (esimId: string, force = false) => {
    setEsims((prev) =>
      prev.map((e) => (e.id === esimId ? { ...e, refreshing: true } : e)),
    )
    try {
      const u = await ordersApi.getUsage(esimId, force)
      setEsims((prev) =>
        prev.map((e) =>
          e.id === esimId
            ? {
              ...e,
              refreshing: false,
              status: normalizeStatus(u.status ?? e.status),
              activatedAt: u.activatedAt ?? e.activatedAt,
              expiresAt: u.expiresAt ?? e.expiresAt,
              usage: {
                available: !!u.available,
                reason: u.reason,
                stale: u.stale,
                usedBytes: u.usedBytes ?? null,
                totalBytes: u.totalBytes ?? null,
                remainingBytes: u.remainingBytes ?? null,
                percentTraffic: u.percentTraffic ?? null,
                percentTime: u.percentTime ?? null,
                validityDaysLeft: u.validityDaysLeft ?? null,
                validityHoursLeft: u.validityHoursLeft ?? null,
              },
            }
            : e,
        ),
      )
    } catch (err) {
      console.warn('Не удалось получить usage для', esimId, err)
      setEsims((prev) =>
        prev.map((e) => (e.id === esimId ? { ...e, refreshing: false } : e)),
      )
    }
  }

  const refreshUsage = (esimId: string) => fetchUsageInto(esimId, true)

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
      <BackHeader title="Мои eSIM" fallbackRoute="/profile" />

      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <div className="flex items-center gap-4">
                <div className="skeleton w-14 h-14 rounded-xl" />
                <div className="flex-1">
                  <div className="skeleton h-5 w-24 mb-2" />
                  <div className="skeleton h-4 w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : esims.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-6">
            <Smartphone className="text-gray-400" size={48} />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Нет активных eSIM
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Купите ваш первый eSIM и он появится здесь
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#f77430] hover:bg-[#f2622a] text-white font-medium rounded-xl transition-colors"
          >
            <Plus size={20} />
            Купить eSIM
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {esims.map((esim) => {
            const statusConfig = getStatusConfig(esim.status)
            const StatusIcon = statusConfig.icon
            const showTopup =
              esim.orderStatus === 'COMPLETED' &&
              esim.canTopup &&
              (esim.status === 'ACTIVE' || esim.status === 'NOT_INSTALLED')
            const validUntilLabel = esim.expiresAt
              ? new Date(esim.expiresAt).toLocaleDateString('ru-RU')
              : null
            const isAwaitingFulfillment = esim.orderStatus === 'PAID' || esim.orderStatus === 'PROCESSING'

            return (
              <div
                key={esim.id}
                className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-3xl">
                    {getCountryEmoji(esim.country)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {esim.country}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {esim.dataAmount}
                    </p>
                    <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color} ${statusConfig.bg}`}>
                      <StatusIcon size={14} />
                      {statusConfig.label}
                    </div>
                  </div>
                </div>

                {/* Прогрессбар трафика */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  {isAwaitingFulfillment ? (
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/30 dark:bg-orange-900/20">
                      <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                        {esim.orderStatus === 'PAID'
                          ? 'Платёж принят, готовим eSIM.'
                          : 'Заказ обрабатывается.'}
                      </p>
                      <p className="mt-1 text-xs text-orange-700 dark:text-orange-300">
                        Страница заказа покажет актуальный статус и данные eSIM сразу после выдачи.
                      </p>
                      <button
                        type="button"
                        onClick={() => router.push(`/order/${esim.id}`)}
                        className="mt-3 inline-flex rounded-xl bg-[#f77430] px-3 py-2 text-sm font-medium text-white"
                      >
                        Открыть заказ
                      </button>
                    </div>
                  ) : esim.usage?.available && esim.usage.percentTraffic !== null ? (
                    <>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-500 dark:text-gray-400">
                          Остаток трафика
                          {esim.usage.stale && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400" title="Данные могут быть устаревшими">
                              (устар.)
                            </span>
                          )}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white inline-flex items-center gap-2">
                          {formatBytes(esim.usage.remainingBytes)} / {formatBytes(esim.usage.totalBytes)}
                          <button
                            type="button"
                            onClick={() => refreshUsage(esim.id)}
                            disabled={esim.refreshing}
                            aria-label="Обновить расход"
                            className="text-gray-400 hover:text-[#f77430] disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw size={14} className={esim.refreshing ? 'animate-spin' : ''} />
                          </button>
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progressColor(esim.usage.percentTraffic)}`}
                          style={{ width: `${esim.usage.percentTraffic}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {esim.usage?.reason || (esim.status === 'NOT_INSTALLED' ? 'Расход появится после активации' : 'Расход обновляется...')}
                      </p>
                      <button
                        type="button"
                        onClick={() => refreshUsage(esim.id)}
                        disabled={esim.refreshing}
                        aria-label="Обновить расход"
                        className="text-gray-400 hover:text-[#f77430] disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw size={14} className={esim.refreshing ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  )}

                  {/* Прогрессбар срока */}
                  {esim.usage?.percentTime !== null && esim.usage?.percentTime !== undefined && (
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                          <Clock size={14} />
                          Остаток срока
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {(() => {
                            const d = esim.usage.validityDaysLeft;
                            const h = esim.usage.validityHoursLeft;
                            if (d == null) return '—';
                            if (d <= 0 && (h ?? 0) <= 0) return 'истёк';
                            const parts: string[] = [];
                            if (d > 0) parts.push(`${d} дн.`);
                            if (h != null && h > 0) parts.push(`${h} ч.`);
                            return parts.length ? `осталось ${parts.join(' ')}` : 'менее часа';
                          })()}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progressColor(esim.usage.percentTime)}`}
                          style={{ width: `${Math.min(100, esim.usage.percentTime)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {validUntilLabel && (
                    <p className="text-xs text-gray-400 mt-2">
                      Действует до {validUntilLabel}
                    </p>
                  )}
                </div>

                {/* Установка eSIM */}
                {(esim.activationCode || esim.smdpAddress) && (
                  <ActivationBlock
                    smdp={esim.smdpAddress}
                    ac={esim.activationCode}
                    iccid={esim.iccid}
                  />
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  {esim.qrCode && (
                    <button
                      onClick={() => router.push(`/order/${esim.id}`)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl font-medium text-sm"
                    >
                      <QrCode size={18} />
                      QR-код
                    </button>
                  )}
                  {showTopup && (
                    <button
                      onClick={() => router.push(`/topup/${esim.id}`)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f77430] hover:bg-[#f2622a] text-white rounded-xl font-medium text-sm transition-colors"
                    >
                      <RefreshCw size={18} />
                      Пополнить
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          <Link href="/">
            <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-6 text-center hover:border-[#f77430] hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors cursor-pointer">
              <Plus className="mx-auto text-gray-400 mb-2" size={32} />
              <p className="font-medium text-gray-600 dark:text-gray-300">Добавить eSIM</p>
            </div>
          </Link>
        </div>
      )}
      <BottomNav />
    </div>
  )
}
