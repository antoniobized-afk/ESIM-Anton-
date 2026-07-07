import type { Product } from '@/lib/api'
import { getCountryName } from '@/lib/utils'
import { isProviderRegionCode } from '@shared/country-display'

const MULTI_KEYWORDS = ['europe', 'asia', 'africa', 'america', 'regional', 'multi', 'евро', 'ази', 'афри', 'регион']
const GLOBAL_KEYWORDS = ['global', 'world', 'глобал', 'мир', 'worldwide']

export function splitCoverageList(value?: string): string[] {
  if (!value) return []
  return value
    .split(/[,\n;]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function extractCoverageCount(value?: string): number | null {
  if (!value) return null
  const match = value.match(/(\d+)\s*стран/i)
  return match ? Number(match[1]) : null
}

export function getCoverageItems(product: Product): string[] {
  const regionItems = splitCoverageList(product.region)
  if (regionItems.length > 1) return regionItems

  const countryItems = splitCoverageList(product.country)
  if (countryItems.length > 1) return countryItems.map(getCountryName)

  return []
}

export function getCoverageCount(product: Product): number {
  const regionItems = splitCoverageList(product.region)
  if (regionItems.length > 1) return regionItems.length

  const regionCount = extractCoverageCount(product.region)
  if (regionCount) return regionCount

  const countryItems = splitCoverageList(product.country)
  if (countryItems.length > 1) return countryItems.length

  return 1
}

export function isGlobalProduct(product: Product): boolean {
  if (isProviderRegionCode(product.country)) {
    return /^(GL|WW)-/i.test(product.country.trim())
  }

  const haystack = `${product.name} ${product.country} ${product.region || ''}`.toLowerCase()
  return GLOBAL_KEYWORDS.some(keyword => haystack.includes(keyword))
}

export function isMultiProduct(product: Product): boolean {
  if (isProviderRegionCode(product.country)) {
    return !isGlobalProduct(product)
  }

  if (isGlobalProduct(product)) return false
  const haystack = `${product.name} ${product.country} ${product.region || ''}`.toLowerCase()
  return (
    getCoverageCount(product) > 1 ||
    MULTI_KEYWORDS.some(keyword => haystack.includes(keyword))
  )
}

export function getCoverageSummary(product: Product): string {
  const coverageCount = getCoverageCount(product)
  if (coverageCount > 1) {
    return `${coverageCount} стран`
  }

  if (product.region) return product.region
  return getCountryName(product.country)
}

export function getCoveragePreview(product: Product, limit = 3): string {
  const items = getCoverageItems(product)
  if (items.length === 0) return ''

  if (items.length <= limit) {
    return items.join(', ')
  }

  return `${items.slice(0, limit).join(', ')} и ещё ${items.length - limit}`
}

export function getCoverageScopeLabel(product: Product): string {
  if (isGlobalProduct(product)) return 'Глобальный пакет'
  if (isMultiProduct(product)) return 'Региональный пакет'
  return 'Пакет для страны'
}
