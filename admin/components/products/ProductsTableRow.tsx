import type { ReactNode } from 'react'
import type { AdminProduct } from '@/lib/types'
import Button from '@/components/ui/Button'
import { TableCell, TableRow } from '@/components/ui/Table'
import { Ban, Check, Database, Edit2, Eye, EyeOff, Flag, Globe2, Infinity, Map, MapPin, Zap } from 'lucide-react'
import { getCountryCode, getCountryFilterLabel, isMultiCountryValue } from '@shared/country-display'
import { getProductDataTypeLabel, normalizeProductDataType } from '@shared/product-data-type'
import { getProviderPriceRubOrNull } from '@shared/product-pricing'

const COVERAGE_TOOLTIP_COUNTRY_LIMIT = 32

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
  const providerCostPerGbRub = getPositiveProviderCostPerGbRub(product.providerCostPerGb, exchangeRate)
  const location = getLocationMeta(product.country)
  const dataTypeLabel = getProductDataTypeLabel(product.dataType, product.isUnlimited)
  const coverageType = getCoverageTypeMeta(product.country)
  const coverageCountries = getCoverageCountries(product)
  const plan = getPlanMeta(product.dataType, dataTypeLabel)
  const productTags = Array.isArray(product.tags) ? product.tags.filter((tag) => tag.trim().length > 0) : []
  const visibleProductTags = productTags.slice(0, 2)
  const hiddenProductTagCount = Math.max(0, productTags.length - visibleProductTags.length)
  const priceTitle = `Поставщик: ${formatRub(providerPriceRUB)}; наша цена: ${formatRub(ourPriceRUB)}; наценка ${formatPercent(markup)}`
  const speedLabel = product.speed?.trim()

  return (
    <TableRow className={`border-b border-slate-200 align-middle transition-colors hover:bg-blue-50/40 ${selected ? 'bg-blue-100' : ''} ${!product.isActive ? 'opacity-60' : ''}`}>
      <TableCell className="w-px whitespace-nowrap px-1.5 py-2 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(product.id)}
          aria-label={`Выбрать тариф ${product.name}`}
          className="w-4 h-4 rounded"
        />
      </TableCell>
      <TableCell className="w-px whitespace-nowrap px-1 py-2 text-center align-middle">
        {location.flagUrl ? (
          <span
            aria-label={location.title}
            title={location.title}
            className="inline-flex h-5 w-7 rounded-[2px] bg-cover bg-center align-middle shadow-sm"
            style={{ backgroundImage: `url(${location.flagUrl})` }}
          />
        ) : (
          <span
            title={location.title}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-600"
          >
            <Globe2 className="h-4 w-4" />
          </span>
        )}
      </TableCell>
      <TableCell className="w-px whitespace-nowrap px-1.5 py-2 text-center align-middle">
        <span title={coverageType.title} className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${coverageType.className}`}>
          {coverageType.icon}
        </span>
      </TableCell>
      <TableCell className="w-px whitespace-nowrap px-1.5 py-2 text-center align-middle">
        <span title={plan.title} className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${plan.className}`}>
          {plan.icon}
        </span>
      </TableCell>
      <TableCell className="px-1.5 py-2 align-middle">
        <CoverageTooltip coverageTitle={location.title} countries={coverageCountries}>
          <span title={location.title} className="block max-w-[clamp(8rem,16vw,15rem)] whitespace-normal break-words leading-tight text-slate-900 underline decoration-slate-400 underline-offset-2">
            {location.label}
          </span>
        </CoverageTooltip>
      </TableCell>
      <TableCell className="px-1.5 py-2 align-middle">
        <div className="max-w-[clamp(13rem,30vw,32rem)] space-y-1">
          <button
            type="button"
            onClick={() => onView(product)}
            title={product.name}
            className="block w-full whitespace-normal break-words text-left font-medium leading-tight text-slate-900 underline decoration-slate-400 underline-offset-2 hover:text-blue-600 hover:decoration-blue-500"
          >
            {product.name}
          </button>
          {productTags.length > 0 ? (
            <div className="flex max-w-full flex-wrap gap-1 overflow-hidden">
              {visibleProductTags.map((tag, index) => (
                <span key={`${tag}-${index}`} title={tag} className="inline-flex max-w-[9rem] rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700">
                  <span className="block min-w-0 truncate">
                    {tag}
                  </span>
                </span>
              ))}
              {hiddenProductTagCount > 0 ? (
                <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-slate-500">
                  +{hiddenProductTagCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2 text-right align-middle" title={priceTitle}>
        <div className="font-semibold text-slate-900">{formatRub(providerPriceRUB)}</div>
        <div className="font-mono text-[11px] leading-tight text-slate-500">${providerPriceUSD.toFixed(2)}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2 text-right align-middle" title={`Наценка: ${formatPercent(markup)}`}>
        <div className="font-semibold text-green-700">{formatRub(ourPriceRUB)}</div>
        <div className="text-[11px] font-semibold leading-tight text-green-600">{formatPercent(markup)}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2 text-center align-middle font-mono text-sm text-slate-950">
        {product.dataAmount}
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2 text-center align-middle">
        <span className={`inline-flex min-w-8 justify-center rounded px-2 py-1 text-xs font-medium ${getDaysClass(product.validityDays)}`}>
          {product.validityDays}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2 text-center align-middle font-mono text-sm text-slate-700">
        {providerCostPerGbRub !== null ? formatRub(providerCostPerGbRub) : <span className="text-slate-300">—</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2 text-center align-middle">
        {speedLabel ? (
          <span
            title={speedLabel}
            className="inline-flex max-w-[clamp(5rem,10vw,10rem)] rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold leading-none text-blue-700"
          >
            <span className="block min-w-0 truncate">{speedLabel}</span>
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TableCell>
      <TableCell className="px-1.5 py-2 text-center align-middle">
        {product.badge ? (
          <span title={product.badge} className={`inline-flex max-w-[clamp(5rem,10vw,10rem)] items-center justify-center rounded-md px-2 py-1 text-center text-xs font-bold leading-tight text-white ${getBadgeColorClass(product.badgeColor)}`}>
            <span className="block whitespace-normal break-normal">{product.badge}</span>
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TableCell>
      <TableCell className="w-px whitespace-nowrap px-1.5 py-2 text-center align-middle">
        {product.supportTopup ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <span className="text-slate-300">—</span>}
      </TableCell>
      <TableCell className="w-px whitespace-nowrap px-1.5 py-2 align-middle">
        <div className="flex justify-center gap-1">
          <Button
            onClick={() => onToggleActive(product)}
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={product.isActive ? 'Скрыть тариф' : 'Показать тариф'}
            title={product.isActive ? 'Активен: скрыть тариф' : 'Скрыт: показать тариф'}
            className={`h-7 w-7 p-0 ${product.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
          >
            {product.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Редактировать тариф"
            title="Редактировать тариф"
            onClick={() => onEdit(product)}
            className="h-7 w-7 p-0 hover:bg-blue-100"
          >
            <Edit2 className="h-3.5 w-3.5 text-blue-600" />
          </Button>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2 text-center align-middle font-mono text-xs text-slate-900">
        <span title={`ID поставщика: ${product.providerId}`} className="block max-w-[clamp(4rem,8vw,8rem)] truncate">
          {product.country}
        </span>
      </TableCell>
    </TableRow>
  )
}

interface CoverageTooltipProps {
  coverageTitle: string
  countries: CoverageCountry[]
  children: ReactNode
}

function CoverageTooltip(props: CoverageTooltipProps) {
  const { coverageTitle, countries, children } = props
  const visibleCountries = countries.slice(0, COVERAGE_TOOLTIP_COUNTRY_LIMIT)
  const hiddenCountryCount = Math.max(0, countries.length - visibleCountries.length)

  return (
    <span className="group relative inline-flex max-w-full" tabIndex={0} aria-label={coverageTitle}>
      {children}
      <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-max max-w-[480px] rounded-md bg-slate-950 px-3 py-2 text-left text-xs text-white shadow-xl group-hover:block group-focus:block group-focus-within:block">
        {countries.length > 0 ? (
          <>
            <span className="mb-2 block font-semibold">Страны ({countries.length}):</span>
            <span className="flex max-w-[440px] flex-wrap gap-1.5">
              {visibleCountries.map((country) => (
                <span key={`${country.code}-${country.name}`} className="inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-1 font-semibold text-white">
                  {country.flagUrl ? (
                    <span
                      aria-hidden="true"
                      className="h-3 w-4 rounded-[2px] bg-cover bg-center shadow-sm"
                      style={{ backgroundImage: `url(${country.flagUrl})` }}
                    />
                  ) : (
                    <Flag className="h-3 w-3 text-white/75" />
                  )}
                  <span>{country.code}</span>
                </span>
              ))}
              {hiddenCountryCount > 0 ? (
                <span className="inline-flex items-center rounded bg-white/20 px-1.5 py-1 font-semibold text-white">+{hiddenCountryCount}</span>
              ) : null}
            </span>
          </>
        ) : (
          <span>{coverageTitle}</span>
        )}
      </span>
    </span>
  )
}

function getLocationMeta(country: string) {
  const code = getCountryCode(country)
  const multiCountry = isMultiCountryValue(country)
  const hasCountryFlag = !multiCountry && /^[A-Z]{2}$/.test(code) && code !== 'XX'

  return {
    flagUrl: hasCountryFlag ? `https://flagcdn.com/w40/${code.toLowerCase()}.png` : null,
    label: getCountryFilterLabel(country),
    multiCountry,
    title: getCountryFilterLabel(country),
  }
}

function getCoverageTypeMeta(country: string) {
  if (!isMultiCountryValue(country)) {
    return {
      label: 'Одна страна',
      title: 'Тариф для одной страны',
      icon: <MapPin className="h-4 w-4" />,
      className: 'border-sky-200 bg-sky-50 text-sky-600',
    }
  }

  const normalized = country.trim().toLowerCase()
  const isGlobal = normalized === 'global' ||
    normalized === 'world' ||
    normalized === 'worldwide' ||
    normalized.startsWith('gl-') ||
    normalized.startsWith('ww-')

  return isGlobal
    ? {
        label: 'Глобальный',
        title: 'Глобальный тариф',
        icon: <Globe2 className="h-4 w-4" />,
        className: 'border-blue-200 bg-blue-50 text-blue-700',
      }
    : {
        label: 'Региональный',
        title: 'Региональный тариф',
        icon: <Map className="h-4 w-4" />,
        className: 'border-violet-300 bg-violet-50 text-violet-700',
      }
}

function getPlanMeta(dataType: AdminProduct['dataType'], fallbackLabel: string) {
  switch (normalizeProductDataType(dataType)) {
    case 1:
      return {
        title: 'Пакет данных на весь срок',
        icon: <Database className="h-4 w-4" />,
        className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
      }
    case 2:
      return {
        title: 'Дневной лимит (снижение скорости)',
        icon: <Zap className="h-4 w-4" />,
        className: 'border-blue-200 bg-blue-50 text-blue-700',
      }
    case 3:
      return {
        title: 'Дневной лимит (отключение услуги)',
        icon: <Ban className="h-4 w-4" />,
        className: 'border-red-200 bg-red-50 text-red-600',
      }
    case 4:
      return {
        title: 'Дневной безлимит',
        icon: <Infinity className="h-4 w-4" />,
        className: 'border-orange-200 bg-orange-50 text-orange-600',
      }
    default:
      return {
        title: fallbackLabel,
        icon: <Database className="h-4 w-4" />,
        className: 'border-slate-200 bg-slate-50 text-slate-600',
      }
  }
}

function getDaysClass(days: number): string {
  if (days <= 7) return 'bg-amber-100 text-amber-800'
  if (days <= 30) return 'bg-cyan-100 text-cyan-800'
  return 'bg-slate-100 text-slate-700'
}

interface CoverageCountry {
  name: string
  code: string
  flagUrl: string | null
}

function getCoverageCountries(product: Pick<AdminProduct, 'country' | 'region'>): CoverageCountry[] {
  const source = product.region?.trim() || product.country.trim()
  if (!source) return []

  const seenCodes = new Set<string>()

  return source
    .split(/[,;]/)
    .map((country) => country.trim())
    .filter(Boolean)
    .map((name) => {
      const code = getCountryCode(name)
      const fallbackCode = name.replace(/[^A-Za-zА-Яа-яЁё]/g, '').slice(0, 2).toUpperCase()
      const displayCode = code !== 'XX' ? code : fallbackCode || 'XX'
      const regionLikeName = isMultiCountryValue(name)

      return {
        name,
        code: displayCode,
        flagUrl: !regionLikeName && /^[A-Z]{2}$/.test(code) && code !== 'XX' ? `https://flagcdn.com/w40/${code.toLowerCase()}.png` : null,
      }
    })
    .filter((country) => {
      const dedupeKey = country.code !== 'XX' ? country.code : country.name.toLowerCase()
      if (seenCodes.has(dedupeKey)) return false
      seenCodes.add(dedupeKey)
      return true
    })
}

function formatRub(value: number): string {
  return `₽${Math.round(value).toLocaleString('ru-RU')}`
}

function getPositiveProviderCostPerGbRub(
  providerCostPerGb: AdminProduct['providerCostPerGb'],
  exchangeRate: number,
): number | null {
  const value = getProviderPriceRubOrNull(providerCostPerGb, exchangeRate)

  return value !== null && value > 0 ? value : null
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
