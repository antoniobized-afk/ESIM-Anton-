import type { AdminProduct } from '@/lib/types'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
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

  return (
    <Modal title="Параметры тарифа" onClose={onClose} contentClassName="max-w-4xl bg-white">
        <div className="p-6">
          <div className="grid grid-cols-2 gap-x-12 gap-y-4">
            <div className="space-y-4">
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Name:</span><span className="font-medium text-slate-800">{product.name}</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Slug:</span><span className="text-slate-700">{product.country}_{product.dataAmount?.replace(/\s/g, '')}_{product.validityDays}</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Тип данных:</span><span className="text-blue-600 font-medium">{getProductDataTypeLabel(product.dataType, product.isUnlimited)}</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Cost:</span><div><div className="font-bold text-slate-800">₽{Math.round(getProviderPriceUSD(product.providerPrice) * exchangeRate).toLocaleString()}</div><div className="text-xs text-slate-500">${getProviderPriceUSD(product.providerPrice).toFixed(2)} по курсу {exchangeRate}₽/$</div></div></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Region type:</span><span className="text-slate-700">Single</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Top up type:</span><span className="text-slate-700 text-sm">Data Reloadable for same area within validity</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Validity:</span><span className="text-slate-700">180 Days</span></div>
            </div>
            <div className="space-y-4">
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Code:</span><span className="text-slate-700">{product.providerId}</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Data:</span><span className="font-medium text-slate-800">{product.dataAmount}</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Duration:</span><span className="text-blue-600 font-medium">{product.validityDays} Days</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Billing starts:</span><span className="text-slate-700">First connection</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Region:</span><span className="text-slate-700">{product.country}</span></div>
              <div className="flex"><span className="w-32 text-slate-500 text-sm">Breakout IP:</span><span className="text-slate-700">Local</span></div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
            <h4 className="font-bold text-slate-700 mb-4">⚙️ Наши настройки</h4>
            <div className="grid grid-cols-3 gap-4">
              <div><span className="text-sm text-slate-500">Наша цена:</span><div className="text-xl font-bold text-green-600">₽{Math.round(Number(product.ourPrice)).toLocaleString()}</div></div>
              <div><span className="text-sm text-slate-500">Наценка:</span><div className="text-xl font-bold text-blue-600">+{getMarkupPercent(product.providerPrice, product.ourPrice).toFixed(0)}%</div></div>
              <div><span className="text-sm text-slate-500">Статус:</span><div className={`text-xl font-bold ${product.isActive ? 'text-green-600' : 'text-slate-400'}`}>{product.isActive ? '✅ Активен' : '⏸️ Скрыт'}</div></div>
            </div>
            {product.badge && <div className="mt-3"><span className="text-sm text-slate-500">Бейдж: </span><span className={`px-3 py-1 rounded-full text-white text-sm font-bold ${product.badgeColor === 'red' ? 'bg-red-500' : product.badgeColor === 'green' ? 'bg-green-500' : product.badgeColor === 'blue' ? 'bg-blue-500' : product.badgeColor === 'orange' ? 'bg-orange-500' : 'bg-purple-500'}`}>{product.badge}</span></div>}
          </div>

          <div className="mt-6">
            <h4 className="text-sm text-slate-500 mb-3">Coverage and networks</h4>
            <div className="flex items-center justify-between p-4 border rounded-xl">
              <div className="flex items-center gap-3"><span className="text-2xl">🌍</span><span className="font-medium">{product.country}</span></div>
              <div className="flex gap-2"><span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">4G</span><span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">LTE</span></div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t bg-slate-50">
          <Button className="flex-1" onClick={() => onEdit(product)}>Редактировать</Button>
          <Button variant="secondary" onClick={onClose}>Закрыть</Button>
        </div>
    </Modal>
  )
}
