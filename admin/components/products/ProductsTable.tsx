import type { AdminProduct, ProductSortField, ProductSortOrder } from '@/lib/types'
import Button from '@/components/ui/Button'
import { SortableHeader, Table, TableBody, TableHead, TableHeaderCell, TableRow } from '@/components/ui/Table'
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
    <div className="glass-card glass-card--static p-6">
      <h2 className="text-2xl font-bold mb-6">Продукты (тарифы eSIM)</h2>
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
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow className="border-b-2 border-slate-300 bg-slate-50">
                <TableHeaderCell className="w-10 px-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                    onChange={onSelectAll}
                    className="w-4 h-4 rounded"
                  />
                </TableHeaderCell>
                <SortableHeader active={sortBy === 'name'} direction={sortOrder} onClick={() => onSort('name')} className="px-2">
                  Name
                </SortableHeader>
                <SortableHeader active={sortBy === 'providerPrice'} direction={sortOrder} onClick={() => onSort('providerPrice')} className="px-2">
                  Цена поставщика
                </SortableHeader>
                <SortableHeader active={sortBy === 'dataAmountMb'} direction={sortOrder} onClick={() => onSort('dataAmountMb')} className="px-2">
                  Data
                </SortableHeader>
                <SortableHeader active={sortBy === 'validityDays'} direction={sortOrder} onClick={() => onSort('validityDays')} className="px-2">
                  Duration
                </SortableHeader>
                <SortableHeader active={sortBy === 'providerCostPerGb'} direction={sortOrder} onClick={() => onSort('providerCostPerGb')} className="px-2">
                  Себестоимость / GB
                </SortableHeader>
                <SortableHeader active={sortBy === 'ourPrice'} direction={sortOrder} onClick={() => onSort('ourPrice')} className="px-2">
                  Наша цена
                </SortableHeader>
                <SortableHeader active={sortBy === 'markupRatio'} direction={sortOrder} onClick={() => onSort('markupRatio')} className="px-2">
                  Наценка
                </SortableHeader>
                <TableHeaderCell className="px-2">Speed</TableHeaderCell>
                <SortableHeader active={sortBy === 'country'} direction={sortOrder} onClick={() => onSort('country')} className="px-2">
                  Region
                </SortableHeader>
                <SortableHeader active={sortBy === 'dataType'} direction={sortOrder} onClick={() => onSort('dataType')} className="px-2">
                  Тип
                </SortableHeader>
                <SortableHeader active={sortBy === 'badge'} direction={sortOrder} onClick={() => onSort('badge')} className="px-2">
                  Бейдж
                </SortableHeader>
                <SortableHeader active={sortBy === 'isActive'} direction={sortOrder} onClick={() => onSort('isActive')} className="px-2">
                  Статус
                </SortableHeader>
                <TableHeaderCell className="px-2" />
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
