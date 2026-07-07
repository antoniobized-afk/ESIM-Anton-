import type { Dispatch, SetStateAction } from 'react'
import type { EditableProduct } from '@/lib/types'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import {
  getProductDataTypeLabel,
  normalizeProductDataType,
  PRODUCT_DATA_TYPE_OPTIONS,
} from '@shared/product-data-type'

interface ProductEditModalProps {
  editingProduct: EditableProduct
  isCreating: boolean
  exchangeRate: number
  editingProviderPriceUsd: string
  editingMarkupPercent: string
  setEditingProduct: Dispatch<SetStateAction<EditableProduct | null>>
  onProviderPriceChange: (value: string) => void
  onOurPriceChange: (value: string) => void
  onMarkupPercentChange: (value: string) => void
  onApplyMarkup: (markup?: number) => void
  onSave: () => void
  onClose: () => void
  getProviderPriceUSD: (providerPrice: number | string) => number
  getMarkupPercent: (providerPrice: number | string, ourPrice: number | string) => number
}

export default function ProductEditModal(props: ProductEditModalProps) {
  const { editingProduct, isCreating, exchangeRate, editingProviderPriceUsd, editingMarkupPercent, setEditingProduct, onProviderPriceChange, onOurPriceChange, onMarkupPercentChange, onApplyMarkup, onSave, onClose, getProviderPriceUSD, getMarkupPercent } = props
  const hasUnknownDataType = editingProduct.dataType == null
  const dataTypeSelectValue = hasUnknownDataType ? '' : String(editingProduct.dataType)

  return (
    <Modal
      title={isCreating ? 'Создать продукт' : 'Редактировать продукт'}
      onClose={onClose}
      contentClassName="max-w-3xl"
    >
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-2">Страна *</label><input type="text" value={editingProduct.country} onChange={(event) => setEditingProduct({ ...editingProduct, country: event.target.value })} placeholder="США" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-2">Регион</label><input type="text" value={editingProduct.region || ''} onChange={(event) => setEditingProduct({ ...editingProduct, region: event.target.value })} placeholder="Например: 🇪🇺 30 стран" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">Название *</label><input type="text" value={editingProduct.name} onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })} placeholder="5GB / 30 дней" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">Описание</label><textarea value={editingProduct.description || ''} onChange={(event) => setEditingProduct({ ...editingProduct, description: event.target.value })} placeholder="Подробное описание тарифа..." rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">Тип данных провайдера *</label>
            <select
              value={dataTypeSelectValue}
              onChange={(event) => setEditingProduct({
                ...editingProduct,
                dataType: normalizeProductDataType(event.target.value) ?? null,
              })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all bg-white"
            >
              {hasUnknownDataType && (
                <option value="">
                  {getProductDataTypeLabel(editingProduct.dataType, editingProduct.isUnlimited)}
                </option>
              )}
              {PRODUCT_DATA_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
            {hasUnknownDataType && (
              <p className="text-xs text-amber-600 mt-1">
                Старый дневной тариф без точного типа: сохранение не изменит его, пока не выбран тип провайдера.
              </p>
            )}
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-2">Объем данных *</label><input type="text" value={editingProduct.dataAmount} onChange={(event) => setEditingProduct({ ...editingProduct, dataAmount: event.target.value })} placeholder="5GB" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-2">Срок действия (дней) *</label><input type="number" value={editingProduct.validityDays} onChange={(event) => setEditingProduct({ ...editingProduct, validityDays: +event.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Цена поставщика (USD) *</label>
            <input type="number" step="0.01" min="0" value={editingProviderPriceUsd} onChange={(event) => onProviderPriceChange(event.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" />
            <p className="text-sm text-slate-500 mt-1">Внутри хранится как `1/10000 USD`: {Number(editingProduct.providerPrice).toLocaleString()}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Наша цена (₽) *</label>
            <input type="number" value={editingProduct.ourPrice} onChange={(event) => onOurPriceChange(event.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" />
            <p className="text-sm text-slate-500 mt-1">Текущая наценка: {getMarkupPercent(editingProduct.providerPrice, editingProduct.ourPrice).toFixed(0)}%</p>
          </div>
          <div className="col-span-2 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Пересчитать по наценке (%)</label>
                <input type="number" value={editingMarkupPercent} onChange={(event) => onMarkupPercentChange(event.target.value)} className="w-40 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" />
              </div>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => onApplyMarkup()}>Применить наценку</Button>
            </div>
            <p className="text-sm text-slate-500 mt-3">Формула: ${getProviderPriceUSD(editingProduct.providerPrice).toFixed(2)} × (1 + {editingMarkupPercent || '0'}/100) × {exchangeRate}₽</p>
            <div className="flex gap-2 flex-wrap mt-3">
              {[30, 50, 100, 150, 200].map((value) => (
                <Button key={value} variant="ghost" size="sm" className="border border-blue-200 bg-white text-blue-700 hover:bg-blue-100" onClick={() => onApplyMarkup(value)}>+{value}%</Button>
              ))}
            </div>
          </div>
          <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">Provider ID *</label><input type="text" value={editingProduct.providerId} onChange={(event) => setEditingProduct({ ...editingProduct, providerId: event.target.value })} placeholder="usa_5gb_30d" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-2">🏷️ Бейдж</label><input type="text" value={editingProduct.badge || ''} onChange={(event) => setEditingProduct({ ...editingProduct, badge: event.target.value || null })} placeholder="ХИТ, -25%, NEW" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">🎨 Цвет бейджа</label>
            <select value={editingProduct.badgeColor || ''} onChange={(event) => setEditingProduct({ ...editingProduct, badgeColor: event.target.value || null })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all">
              <option value="">По умолчанию (фиолетовый)</option><option value="red">🔴 Красный</option><option value="green">🟢 Зеленый</option><option value="blue">🔵 Синий</option><option value="orange">🟠 Оранжевый</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">🏷️ Теги (через запятую)</label>
            <input
              type="text"
              value={Array.isArray(editingProduct.tags) ? editingProduct.tags.join(', ') : ''}
              onChange={(event) => setEditingProduct({ ...editingProduct, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
              placeholder="Например: Материковый Китай, Не гонконгский IP, 5G"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">Эти пометки видит клиент в карточке тарифа. При синхронизации с провайдером не затираются.</p>
          </div>
          <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">📝 Примечание</label><textarea value={editingProduct.notes || ''} onChange={(event) => setEditingProduct({ ...editingProduct, notes: event.target.value || null })} placeholder="Особенности активации, ограничения, прочие пояснения..." rows={2} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" /></div>
          <div className="col-span-2"><label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={editingProduct.isActive} onChange={(event) => setEditingProduct({ ...editingProduct, isActive: event.target.checked })} className="w-5 h-5 rounded" /><span className="font-medium text-lg">Показывать продукт в каталоге</span></label></div>
        </div>
        <div className="flex gap-3 pt-6">
          <Button className="flex-1" onClick={onSave}>Сохранить</Button>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
        </div>
    </Modal>
  )
}
