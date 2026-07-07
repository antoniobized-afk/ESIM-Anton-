'use client'

import { Ban, Clock, MapPin, Smartphone, Tag, Wifi } from '@/components/icons'
import type { Product } from '@/lib/api'
import { formatDataAmount, formatPrice, getCountryName, getFlagUrl } from '@/lib/utils'

interface ProductHeaderCardProps {
  product: Product
  afterLimitNote: string | null
}

interface OrderSummaryCardProps {
  product: Product
  isDaily: boolean
  purchaseDays: number
  coverageSummary: string
  displayedBasePrice: number
}

interface DailyDaysSelectorProps {
  maxDays: number
  purchaseDays: number
  quickDayOptions: number[]
  onChange: (value: number) => void
  onDecrement: () => void
  onIncrement: () => void
}

export function ProductHeaderCard({ product, afterLimitNote }: ProductHeaderCardProps) {
  const flagUrl = getFlagUrl(product.country)
  const countryName = getCountryName(product.country)

  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center border border-gray-100">
          {flagUrl ? (
            <img
              src={flagUrl}
              alt={countryName}
              className="w-10 h-auto rounded object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = '/logo-mark.png'
                target.className = 'w-9 h-9 rounded-lg object-contain'
              }}
            />
          ) : (
            <img src="/logo-mark.png" alt="Mojo mobile" className="w-9 h-9 rounded-lg object-contain" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary leading-tight truncate">{countryName}</h1>
          {(product.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(product.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-500 mt-2 leading-snug">
            {product.isUnlimited
              ? 'Лимит обновляется каждый день в течение выбранного периода.'
              : 'Весь объём можно использовать в любой день до окончания срока.'}
          </p>
          {afterLimitNote && (
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              {afterLimitNote}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function OrderSummaryCard({
  product,
  isDaily,
  purchaseDays,
  coverageSummary,
  displayedBasePrice,
}: OrderSummaryCardProps) {
  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
        <div className="flex items-center gap-2 text-secondary">
          <Wifi size={16} />
          <span className="text-sm">Трафик</span>
        </div>
        <span className="font-semibold text-primary">
          {formatDataAmount(product.dataAmount)}{isDaily ? ' / день' : ''}
        </span>
      </div>
      <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
        <div className="flex items-center gap-2 text-secondary">
          <Clock size={16} />
          <span className="text-sm">Срок действия</span>
        </div>
        <span className="font-semibold text-primary">
          {isDaily ? `${purchaseDays} дней` : `${product.validityDays} дней`}
        </span>
      </div>
      {isDaily && (
        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
          <div className="flex items-center gap-2 text-secondary">
            <Tag size={16} />
            <span className="text-sm">Цена за день</span>
          </div>
          <span className="font-semibold text-primary">₽{formatPrice(product.ourPrice)}</span>
        </div>
      )}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2 text-secondary">
          <MapPin size={16} />
          <span className="text-sm">Где работает</span>
        </div>
        <span className="font-semibold text-primary text-right max-w-[60%]">{coverageSummary}</span>
      </div>
      <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100 dark:border-gray-800/50">
        <span className="text-sm font-medium text-secondary">Базовая стоимость тарифа</span>
        <p className="text-lg font-bold text-primary">₽{formatPrice(displayedBasePrice)}</p>
      </div>
    </div>
  )
}

export function ProductAdminNoteCard({ product }: { product: Product }) {
  const tags = product.tags ?? []
  if (tags.length === 0 && !product.notes) return null

  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/30" style={{ animationDelay: '0.11s' }}>
      <p className="text-xs uppercase tracking-wide text-yellow-700 dark:text-yellow-500 mb-1">Примечание</p>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {product.notes && (
        <p className="text-sm text-yellow-900 dark:text-yellow-400 whitespace-pre-line">{product.notes}</p>
      )}
    </div>
  )
}

export function ProductUsageInfoCard() {
  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up bg-orange-50/70 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30" style={{ animationDelay: '0.12s' }}>
      <div className="flex items-start gap-3 mb-3">
        <Smartphone size={20} className="text-orange-700 dark:text-orange-500 shrink-0 mt-0.5" />
        <span className="text-sm text-orange-900 dark:text-orange-400">
          Только интернет. Звонки и СМС недоступны.
        </span>
      </div>
      <div className="flex items-start gap-3">
        <Ban size={20} className="text-orange-700 dark:text-orange-500 shrink-0 mt-0.5" />
        <span className="text-sm text-orange-900 dark:text-orange-400">
          Не подходит для регистрации в сервисах (WhatsApp, Telegram и др.)
        </span>
      </div>
    </div>
  )
}

export function DailyDaysSelector({
  maxDays,
  purchaseDays,
  quickDayOptions,
  onChange,
  onDecrement,
  onIncrement,
}: DailyDaysSelectorProps) {
  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.12s' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Количество дней</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">до {maxDays} дн.</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onDecrement}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          max={maxDays}
          value={purchaseDays}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 text-center py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-bold text-primary focus:outline-none focus:ring-2 focus:ring-[#f77430]/25"
        />
        <button
          onClick={onIncrement}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700"
        >
          +
        </button>
      </div>
      {quickDayOptions.length > 0 && (
        <div className="flex gap-2 mt-3">
          {quickDayOptions.map((days) => (
            <button
              key={days}
              onClick={() => onChange(days)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${purchaseDays === days
                ? 'bg-[#f77430] text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              }`}
            >
              {days} дн.
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
