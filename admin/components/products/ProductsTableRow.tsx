import type { AdminProduct } from '@/lib/types'
import Button from '@/components/ui/Button'
import { TableCell, TableRow } from '@/components/ui/Table'
import { Edit2, Eye, EyeOff } from 'lucide-react'
import { getProductDataTypeLabel } from '@shared/product-data-type'

interface ProductsTableRowProps {
  product: AdminProduct
  exchangeRate: number
  selected: boolean
  onSelect: (id: string) => void
  onView: (product: AdminProduct) => void
  onEdit: (product: AdminProduct) => void
  onToggleActive: (product: AdminProduct) => void
  getProviderPriceUSD: (providerPrice: number | string) => number
  getMarkupPercent: (providerPrice: number | string, ourPrice: number | string) => number
}

export default function ProductsTableRow(props: ProductsTableRowProps) {
  const { product, exchangeRate, selected, onSelect, onView, onEdit, onToggleActive, getProviderPriceUSD, getMarkupPercent } = props
  const providerPriceUSD = getProviderPriceUSD(product.providerPrice)
  const providerPriceRUB = providerPriceUSD * exchangeRate
  const ourPriceRUB = Number(product.ourPrice)
  const markup = getMarkupPercent(product.providerPrice, product.ourPrice)
  const dataMatch = product.dataAmount?.match(/(\d+(\.\d+)?)\s*(GB|MB)/i)
  const dataInGB = dataMatch ? (dataMatch[3].toUpperCase() === 'GB' ? parseFloat(dataMatch[1]) : parseFloat(dataMatch[1]) / 1024) : 0
  const perGB = dataInGB > 0 ? providerPriceRUB / dataInGB : 0

  return (
    <TableRow className={`border-b border-slate-100 hover:bg-blue-50/50 transition-colors ${selected ? 'bg-blue-100' : ''} ${!product.isActive ? 'opacity-50' : ''}`}>
      <TableCell className="px-2 py-2">
        <input type="checkbox" checked={selected} onChange={() => onSelect(product.id)} className="w-4 h-4 rounded" />
      </TableCell>
      <TableCell className="px-2 py-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌍</span>
            <button onClick={() => onView(product)} className="font-medium text-blue-600 hover:underline text-left">
              {product.name}
            </button>
          </div>
          {Array.isArray(product.tags) && product.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 ml-7">
              {product.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-medium">
                  {tag}
                </span>
              ))}
              {product.tags.length > 3 && <span className="text-[10px] text-slate-400">+{product.tags.length - 3}</span>}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="px-2 py-2 font-semibold">
        <div className="font-semibold text-slate-800">₽{Math.round(providerPriceRUB).toLocaleString()}</div>
        <div className="text-xs text-slate-500">${providerPriceUSD.toFixed(2)}</div>
      </TableCell>
      <TableCell className="px-2 py-2 font-medium">{product.dataAmount}</TableCell>
      <TableCell className="px-2 py-2"><div className="flex items-center gap-1"><span className="text-slate-400">📅</span><span>{product.validityDays}</span></div></TableCell>
      <TableCell className="px-2 py-2 text-slate-600"><div>₽{Math.round(perGB).toLocaleString()}</div><div className="text-xs text-slate-500">по курсу {exchangeRate}₽/$</div></TableCell>
      <TableCell className="px-2 py-2 font-bold text-green-600">₽{Math.round(ourPriceRUB).toLocaleString()}</TableCell>
      <TableCell className="px-2 py-2 text-sm"><span className={`font-medium ${markup > 0 ? 'text-green-600' : 'text-slate-400'}`}>+{markup.toFixed(0)}%</span></TableCell>
      <TableCell className="px-2 py-2"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">3G/4G/5G</span></TableCell>
      <TableCell className="px-2 py-2 text-slate-600 text-xs">{product.country}</TableCell>
      <TableCell className="px-2 py-2">
        <span className="inline-flex max-w-[160px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium leading-tight">
          {getProductDataTypeLabel(product.dataType, product.isUnlimited)}
        </span>
      </TableCell>
      <TableCell className="px-2 py-2">
        {product.badge ? (
          <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${product.badgeColor === 'red' ? 'bg-red-500' : product.badgeColor === 'green' ? 'bg-green-500' : product.badgeColor === 'blue' ? 'bg-blue-500' : product.badgeColor === 'orange' ? 'bg-orange-500' : 'bg-purple-500'}`}>
            {product.badge}
          </span>
        ) : <span className="text-slate-300">—</span>}
      </TableCell>
      <TableCell className="px-2 py-2">
        <Button
          onClick={() => onToggleActive(product)}
          size="sm"
          className={`px-2 py-1 text-xs ${product.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
        >
          {product.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {product.isActive ? 'Вкл' : 'Выкл'}
        </Button>
      </TableCell>
      <TableCell className="px-2 py-2">
        <Button variant="ghost" size="sm" iconOnly aria-label="Редактировать тариф" onClick={() => onEdit(product)} className="p-1.5 hover:bg-blue-100">
          <Edit2 className="w-4 h-4 text-blue-600" />
        </Button>
      </TableCell>
    </TableRow>
  )
}
