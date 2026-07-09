import type { ReactNode } from 'react'
import type { AdminProduct } from '@/lib/types'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { getCountryFilterLabel } from '@shared/country-display'
import { getProductDataTypeLabel } from '@shared/product-data-type'

interface ProductViewModalProps {
  product: AdminProduct
  exchangeRate: number
  onEdit: (product: AdminProduct) => void
  onClose: () => void
  getProviderPriceUSD: (providerPrice: number | string) => number
  getMarkupPercent: (providerPrice: number | string, ourPrice: number | string) => number
}

export default function ProductViewModal(props: ProductViewModalProps) {
  const { product, exchangeRate, onEdit, onClose, getProviderPriceUSD, getMarkupPercent } = props
  const providerPriceUSD = getProviderPriceUSD(product.providerPrice)
  const providerPriceRub = providerPriceUSD * exchangeRate
  const markup = getMarkupPercent(product.providerPrice, product.ourPrice)

  return (
    <Modal title="Параметры тарифа" onClose={onClose} contentClassName="max-w-4xl bg-white">
      <div className="space-y-6 p-6">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-slate-400">{product.country}</div>
          <h3 className="mt-1 break-words text-xl font-bold text-slate-900">{product.name}</h3>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <section>
            <SectionTitle>Основное</SectionTitle>
            <div className="space-y-3">
              <DetailRow label="Код">{product.country}</DetailRow>
              <DetailRow label="Локация">{getCountryFilterLabel(product.country)}</DetailRow>
              <DetailRow label="Регион">{formatOptional(product.region)}</DetailRow>
              <DetailRow label="Данные">{product.dataAmount}</DetailRow>
              <DetailRow label="Срок">{product.validityDays} дней</DetailRow>
              <DetailRow label="Тип">{getProductDataTypeLabel(product.dataType, product.isUnlimited)}</DetailRow>
            </div>
          </section>

          <section>
            <SectionTitle>Поставщик</SectionTitle>
            <div className="space-y-3">
              <DetailRow label="ID поставщика">{product.providerId}</DetailRow>
              <DetailRow label="Поставщик">{formatOptional(product.providerName)}</DetailRow>
              <DetailRow label="Скорость">{formatOptional(product.speed)}</DetailRow>
              <DetailRow label="Пополнение">{formatBoolean(product.supportTopup)}</DetailRow>
              <DetailRow label="Остаток">{typeof product.stock === 'number' ? product.stock : 'Не указано'}</DetailRow>
            </div>
          </section>

          <section>
            <SectionTitle>Цены</SectionTitle>
            <div className="space-y-3">
              <DetailRow label="Поставщик">
                <span className="font-semibold text-slate-900">{formatRub(providerPriceRub)}</span>
                <span className="ml-2 text-xs text-slate-500">${providerPriceUSD.toFixed(2)} по курсу {exchangeRate}₽/$</span>
              </DetailRow>
              <DetailRow label="Наша цена">
                <span className="font-semibold text-green-600">{formatRub(Number(product.ourPrice))}</span>
              </DetailRow>
              <DetailRow label="Наценка">{formatPercent(markup)}</DetailRow>
              <DetailRow label="Статус">{product.isActive ? 'Активен' : 'Скрыт'}</DetailRow>
            </div>
          </section>

          <section>
            <SectionTitle>Админские пометки</SectionTitle>
            <div className="space-y-3">
              <DetailRow label="Бейдж">
                {product.badge ? (
                  <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold text-white ${getBadgeColorClass(product.badgeColor)}`}>
                    {product.badge}
                  </span>
                ) : 'Не указан'}
              </DetailRow>
              <DetailRow label="Теги">
                {Array.isArray(product.tags) && product.tags.length > 0 ? product.tags.join(', ') : 'Не указаны'}
              </DetailRow>
              <DetailRow label="Описание">{formatOptional(product.description)}</DetailRow>
              <DetailRow label="Примечание">{formatOptional(product.notes)}</DetailRow>
            </div>
          </section>
        </div>
      </div>
      <div className="flex gap-3 border-t bg-slate-50 p-6">
        <Button className="flex-1" onClick={() => onEdit(product)}>Редактировать</Button>
        <Button variant="secondary" onClick={onClose}>Закрыть</Button>
      </div>
    </Modal>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-3 text-xs font-semibold uppercase text-slate-500">{children}</h4>
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 text-sm">
      <span className="text-slate-500">{label}:</span>
      <span className="min-w-0 break-words text-slate-800">{children}</span>
    </div>
  )
}

function formatOptional(value?: string | null): string {
  const trimmed = value?.trim()
  return trimmed || 'Не указано'
}

function formatBoolean(value?: boolean | null): string {
  if (value === undefined || value === null) return 'Не указано'
  return value ? 'Да' : 'Нет'
}

function formatRub(value: number): string {
  return `₽${Math.round(value).toLocaleString('ru-RU')}`
}

function formatPercent(value: number): string {
  const rounded = value.toFixed(0)
  return value > 0 ? `+${rounded}%` : `${rounded}%`
}

function getBadgeColorClass(color?: string | null): string {
  switch (color) {
    case 'red':
      return 'bg-red-500'
    case 'green':
      return 'bg-green-500'
    case 'blue':
      return 'bg-blue-500'
    case 'orange':
      return 'bg-orange-500'
    default:
      return 'bg-purple-500'
  }
}
