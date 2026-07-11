import type { NumericLike } from '@/lib/types'

export function formatMarketingCount(value: number) {
  return value.toLocaleString('ru-RU')
}

export function formatMarketingMoney(value: NumericLike | null) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`
}

export function formatMarketingDateTimeUtc(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return `${date.toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC`
}
