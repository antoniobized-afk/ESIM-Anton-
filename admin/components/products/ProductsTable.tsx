import type { AdminProduct, ProductSortField, ProductSortOrder } from '@/lib/types'
import Button from '@/components/ui/Button'
import { Table, TableBody, TableHead, TableHeaderCell, TableRow } from '@/components/ui/Table'
import { Package } from 'lucide-react'
import ProductsTableRow from './ProductsTableRow'

interface ProductsTableProps {
  filteredProducts: AdminProduct[]
  selectedIds: Set<string>
  exchangeRate: number
  sortBy: ProductSortField
  sortOrder: ProductSortOrder
  error: string | null
  onRetry: () => void
  onSelectAll: () => void
  onSelectOne: (id: string) => void
  onView: (product: AdminProduct) => void
  onEdit: (product: AdminProduct) => void
  onToggleActive: (product: AdminProduct) => void
  onSort: (field: ProductSortField) => void
  getProviderPriceUSD: (providerPrice: number | string) => number
  getMarkupPercent: (providerPrice: number | string, ourPrice: number | string) => number
}

export default function ProductsTable(props: ProductsTableProps) {
  const { filteredProducts, selectedIds, exchangeRate, sortBy, sortOrder, error, onRetry, onSelectAll, onSelectOne, onView, onEdit, onToggleActive, onSort, getProviderPriceUSD, getMarkupPercent } = props

  return (
    <div className="glass-card glass-card--static p-4">
      <h2 className="mb-4 text-xl font-bold text-slate-800">Продукты (тарифы eSIM)</h2>
      {error ? (
        <div className="glass-card p-6 bg-red-50 border-red-200">
          <p className="text-red-700 font-medium">{error}</p>
          <Button onClick={onRetry} variant="ghost" size="sm" className="mt-2 px-0 text-red-600 hover:bg-transparent hover:text-red-700">
            Попробовать снова
          </Button>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Package className="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p className="text-lg">Нет продуктов по выбранным фильтрам</p>
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-visible">
          <Table className="min-w-max table-auto">
            <TableHead>
              <TableRow className="border-b border-slate-200 bg-white">
                <TableHeaderCell className="px-1.5 py-2 align-middle">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                    onChange={onSelectAll}
                    aria-label="Выбрать все тарифы на странице"
                    className="w-4 h-4 rounded"
                  />
                </TableHeaderCell>
                <TableHeaderCell className="px-1 py-2 align-middle" aria-label="Иконка локации" />
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center">
                  <span className="text-xs font-medium leading-none text-slate-900">Тип</span>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center">
                  <CompactSortButton field="dataType" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    План
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle">
                  <span className="text-xs font-medium leading-none text-slate-900">Локация</span>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle">
                  <CompactSortButton field="name" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    Название
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-right">
                  <CompactSortButton field="providerPrice" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    Поставщик
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-right">
                  <CompactSortButton field="ourPrice" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    Наша цена
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center">
                  <CompactSortButton field="dataAmountMb" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    ГБ
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center">
                  <CompactSortButton field="validityDays" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    Дни
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center">
                  <CompactSortButton field="providerCostPerGb" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    ₽/ГБ
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center text-xs font-medium text-slate-900">
                  Скорость
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center">
                  <CompactSortButton field="badge" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    Бейдж
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center text-xs font-medium text-slate-900">
                  Top
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center">
                  <CompactSortButton field="isActive" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    Статус
                  </CompactSortButton>
                </TableHeaderCell>
                <TableHeaderCell className="px-1.5 py-2 align-middle text-center text-xs font-medium text-slate-900">
                  <CompactSortButton field="country" activeField={sortBy} direction={sortOrder} onSort={onSort}>
                    Код
                  </CompactSortButton>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProducts.map((product) => (
                <ProductsTableRow
                  key={product.id}
                  product={product}
                  exchangeRate={exchangeRate}
                  selected={selectedIds.has(product.id)}
                  onSelect={onSelectOne}
                  onView={onView}
                  onEdit={onEdit}
                  onToggleActive={onToggleActive}
                  getProviderPriceUSD={getProviderPriceUSD}
                  getMarkupPercent={getMarkupPercent}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

interface CompactSortButtonProps {
  field: ProductSortField
  activeField: ProductSortField
  direction: ProductSortOrder
  onSort: (field: ProductSortField) => void
  children: string
}

function CompactSortButton(props: CompactSortButtonProps) {
  const { field, activeField, direction, onSort, children } = props
  const active = activeField === field

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      title={active ? `Сортировка: ${children}, ${direction === 'asc' ? 'по возрастанию' : 'по убыванию'}` : `Сортировать по колонке "${children}"`}
      aria-label={active ? `Сортировка по колонке ${children}, ${direction === 'asc' ? 'по возрастанию' : 'по убыванию'}` : `Сортировать по колонке ${children}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap text-left text-xs font-medium leading-none transition-colors hover:text-blue-600 ${active ? 'text-blue-600' : 'text-slate-900'}`}
    >
      <span>{children}</span>
      <span className={active ? 'text-blue-600' : 'text-slate-300'} aria-hidden="true">
        {active ? (direction === 'asc' ? '↑' : '↓') : ''}
      </span>
    </button>
  )
}
