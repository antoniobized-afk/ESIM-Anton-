'use client'

import { useState, useEffect } from 'react'
import { promoCodesApi } from '@/lib/api'
import type { PromoCode } from '@/lib/types'

interface PromoSelectProps {
  value: string // promoCodeId
  onChange: (promoCodeId: string) => void
  disabled?: boolean
  className?: string
}

export default function PromoSelect({ value, onChange, disabled, className }: PromoSelectProps) {
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    promoCodesApi
      .getAll()
      .then(({ data }) => setPromos(data.filter((p) => p.isActive)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const selectCls =
    'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      className={`${selectCls} ${className ?? ''}`}
    >
      <option value="">— без промокода —</option>
      {promos.map((p) => (
        <option key={p.id} value={p.id}>
          {p.code} ({p.discountPercent}%{p.maxUses ? `, макс. ${p.maxUses}` : ''})
        </option>
      ))}
    </select>
  )
}
