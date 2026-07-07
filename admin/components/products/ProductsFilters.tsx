import type { AdminProduct } from '@/lib/types'
import Button from '@/components/ui/Button'
import { ChevronDown, Eye, EyeOff, Filter, Search } from 'lucide-react'
import { DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE, PRODUCT_DATA_TYPE_OPTIONS } from '@shared/product-data-type'
import type { ProductDataTypeSelector } from '@shared/product-data-type'
import type { DataUnitFilter, ProductDataTypeFilter } from './useProducts'
import { getCountryFilterLabel, isMultiCountryValue } from '@shared/country-display'

type CountryFilterOption = {
  value: string
  label: string
}

interface ProductsFiltersProps {
  countries: string[]
  products: AdminProduct[]
  filteredProducts: AdminProduct[]
  totalProducts: number
  page: number
  selectedCountry: string
  showActiveOnly: boolean | null
  dataType: ProductDataTypeFilter
  dataAmountQuery: string
  dataUnit: DataUnitFilter
  durationDaysQuery: string
  searchQuery: string
  onCountryChange: (value: string) => void
  onStatusChange: (value: boolean | null) => void
  onDataTypeChange: (value: ProductDataTypeFilter) => void
  onDataAmountChange: (value: string) => void
  onDataUnitChange: (value: DataUnitFilter) => void
  onDurationDaysChange: (value: string) => void
  onSearchChange: (value: string) => void
  onClear: () => void
  onToggleByDataType: (dataType: ProductDataTypeSelector, isActive: boolean) => void
}

export default function ProductsFilters(props: ProductsFiltersProps) {
  const {
    countries,
    products,
    filteredProducts,
    totalProducts,
    page,
    selectedCountry,
    showActiveOnly,
    dataType,
    dataAmountQuery,
    dataUnit,
    durationDaysQuery,
    searchQuery,
    onCountryChange,
    onStatusChange,
    onDataTypeChange,
    onDataAmountChange,
    onDataUnitChange,
    onDurationDaysChange,
    onSearchChange,
    onClear,
    onToggleByDataType,
  } = props
  const countryOptions = countries
    .map((country) => ({
      value: country,
      label: getCountryFilterLabel(country),
      isMultiCountry: isMultiCountryValue(country),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'ru'))
  const singleCountryOptions = countryOptions.filter((option) => !option.isMultiCountry)
  const multiCountryOptions = countryOptions.filter((option) => option.isMultiCountry)

  const renderCountryOptions = (options: CountryFilterOption[]) =>
    options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))
  const bulkDataTypeOptions: Array<{ value: ProductDataTypeSelector; label: string; enableClassName: string }> = [
    {
      value: 1,
      label: PRODUCT_DATA_TYPE_OPTIONS.find((option) => option.value === 1)?.label ?? 'Пакет данных на весь срок',
      enableClassName: 'bg-green-500 hover:bg-green-600',
    },
    {
      value: DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE,
      label: 'Все дневные типы',
      enableClassName: 'bg-purple-500 hover:bg-purple-600',
    },
    ...PRODUCT_DATA_TYPE_OPTIONS
      .filter((option) => option.value !== 1)
      .map((option) => ({
        value: option.value,
        label: option.label,
        enableClassName: 'bg-blue-500 hover:bg-blue-600',
      })),
  ]

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-slate-500" />
        <h3 className="font-semibold text-lg">Фильтры</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск по названию..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
          />
        </div>

        <div className="relative">
          <select
            value={selectedCountry}
            onChange={(event) => onCountryChange(event.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all appearance-none bg-white"
          >
            <option value="">Все направления ({countries.length})</option>
            {singleCountryOptions.length > 0 && (
              <optgroup label={`Страны (${singleCountryOptions.length})`}>
                {renderCountryOptions(singleCountryOptions)}
              </optgroup>
            )}
            {multiCountryOptions.length > 0 && (
              <optgroup label={`Мультистраны (${multiCountryOptions.length})`}>
                {renderCountryOptions(multiCountryOptions)}
              </optgroup>
            )}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={showActiveOnly === null ? '' : showActiveOnly ? 'active' : 'inactive'}
            onChange={(event) => {
              const { value } = event.target
              if (value === '') onStatusChange(null)
              else onStatusChange(value === 'active')
            }}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all appearance-none bg-white"
          >
            <option value="">Все статусы</option>
            <option value="active">✅ Только активные</option>
            <option value="inactive">⏸️ Только скрытые</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={dataType}
            onChange={(event) => onDataTypeChange(event.target.value as ProductDataTypeFilter)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all appearance-none bg-white"
          >
            <option value="all">Тип данных</option>
            <option value={DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE}>Все дневные типы</option>
            {PRODUCT_DATA_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <input
          type="text"
          inputMode="decimal"
          pattern="\d*([.,]\d*)?"
          value={dataAmountQuery}
          onChange={(event) => onDataAmountChange(event.target.value)}
          placeholder="Объем"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
        />

        <div className="relative">
          <select
            value={dataUnit}
            onChange={(event) => onDataUnitChange(event.target.value as DataUnitFilter)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all appearance-none bg-white"
          >
            <option value="all">MB/GB</option>
            <option value="MB">MB</option>
            <option value="GB">GB</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <input
          type="text"
          inputMode="numeric"
          pattern="[1-9]\d*"
          value={durationDaysQuery}
          onChange={(event) => onDurationDaysChange(event.target.value)}
          placeholder="Срок (дней)"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
        />

        <Button onClick={onClear} variant="secondary">
          Сбросить фильтры
        </Button>
      </div>

      <div className="mt-4 flex gap-4 flex-wrap text-sm text-slate-500">
        <span>Найдено: <strong className="text-slate-700">{totalProducts}</strong></span>
        <span>На странице: <strong className="text-slate-700">{filteredProducts.length}</strong></span>
        <span>Страница: <strong className="text-slate-700">{page}</strong></span>
        <span>Активных на странице: <strong className="text-green-600">{products.filter((product) => product.isActive).length}</strong></span>
        <span>Скрытых на странице: <strong className="text-slate-400">{products.filter((product) => !product.isActive).length}</strong></span>
      </div>

      <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h4 className="font-semibold text-slate-700 mb-3">⚡ Быстрые действия по provider dataType</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {bulkDataTypeOptions.map((option) => (
            <div key={option.value} className="flex gap-2 items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
              <span className="min-w-0 text-sm text-slate-600 font-medium break-words">{option.label}</span>
              <div className="flex gap-2 shrink-0">
                <Button onClick={() => onToggleByDataType(option.value, true)} size="sm" className={option.enableClassName}>
                  <Eye className="w-3.5 h-3.5" />
                  Включить
                </Button>
                <Button onClick={() => onToggleByDataType(option.value, false)} size="sm" className="bg-slate-400 hover:bg-slate-500">
                  <EyeOff className="w-3.5 h-3.5" />
                  Выключить
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
