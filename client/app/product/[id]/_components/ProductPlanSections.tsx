'use client'

import { MapPin, Smartphone, Ban } from 'lucide-react'
import { Wifi, Clock, Tag } from '@/components/icons'
import type { Product } from '@/lib/api'
import {
  getClientProductDataTypeLabel,
  getProductHeaderDescription,
  getProductLimitPolicyText,
  getProductTrafficText,
} from '@/lib/productDataType'
import { formatPrice, getCountryName, getFlagUrl } from '@/lib/utils'

export function ProductHeaderCard({ product }: { product: Product }) {
  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center border border-gray-100">
          {getFlagUrl(product.country) ? (
            <img
              src={getFlagUrl(product.country)}
              alt={getCountryName(product.country)}
              className="w-10 h-auto rounded object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo-mark.png';
                (e.target as HTMLImageElement).className = 'w-9 h-9 rounded-lg object-contain';
              }}
            />
          ) : (
            <img src="/logo-mark.png" alt="Mojo mobile" className="w-9 h-9 rounded-lg object-contain" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary leading-tight truncate">
            {getCountryName(product.country)}
          </h1>
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
            {getProductHeaderDescription(product)}
          </p>
        </div>
      </div>
    </div>
  )
}

export function OrderSummaryCard({
  coverageSummary,
  displayedBasePrice,
  isDaily,
  product,
  selectedDays,
}: {
  coverageSummary: string
  displayedBasePrice: number
  isDaily: boolean
  product: Product
  selectedDays: number
}) {
  const limitPolicyText = getProductLimitPolicyText(product)

  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
        <div className="flex items-center gap-2 text-secondary">
          <Wifi size={16} />
          <span className="text-sm">Трафик</span>
        </div>
        <span className="font-semibold text-primary">{getProductTrafficText(product)}</span>
      </div>
      <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
        <div className="flex items-center gap-2 text-secondary">
          <Tag size={16} />
          <span className="text-sm">Тип тарифа</span>
        </div>
        <span className="font-semibold text-primary text-right max-w-[60%]">
          {getClientProductDataTypeLabel(product)}
        </span>
      </div>
      {limitPolicyText && (
        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
          <div className="flex items-center gap-2 text-secondary">
            <Wifi size={16} />
            <span className="text-sm">После лимита</span>
          </div>
          <span className="font-semibold text-primary text-right max-w-[60%]">{limitPolicyText}</span>
        </div>
      )}
      <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800/50">
        <div className="flex items-center gap-2 text-secondary">
          <Clock size={16} />
          <span className="text-sm">Срок действия</span>
        </div>
        <span className="font-semibold text-primary">
          {isDaily ? `${selectedDays} дней` : `${product.validityDays} дней`}
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

export function NotesCard({ product }: { product: Product }) {
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

export function EsimCompatibilityNotice() {
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

export function DaysSelector({
  maxDays,
  onChange,
  selectedDays,
}: {
  maxDays: number
  onChange: (days: number) => void
  selectedDays: number
}) {
  const normalizedMaxDays = Math.max(1, maxDays)
  const clampDays = (days: number) => Math.min(normalizedMaxDays, Math.max(1, days))
  const presetDays = Array.from(
    new Set([3, 5, 7, 14, 30, normalizedMaxDays].filter((days) => days >= 1 && days <= normalizedMaxDays)),
  ).sort((a, b) => a - b)

  return (
    <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.12s' }}>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Количество дней</h3>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(clampDays(selectedDays - 1))}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          max={normalizedMaxDays}
          value={clampDays(selectedDays)}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10)
            if (!Number.isNaN(value)) onChange(clampDays(value))
          }}
          className="flex-1 text-center py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-bold text-primary focus:outline-none focus:ring-2 focus:ring-[#f77430]/25"
        />
        <button
          onClick={() => onChange(clampDays(selectedDays + 1))}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700"
        >
          +
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        {presetDays.map((days) => (
          <button
            key={days}
            onClick={() => onChange(days)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedDays === days
                ? 'bg-[#f77430] text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              }`}
          >
            {days} дн.
          </button>
        ))}
      </div>
    </div>
  )
}
