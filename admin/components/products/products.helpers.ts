import type { EditableProduct } from '@/lib/types'

export const getProviderPriceUSD = (providerPrice: number | string) => Number(providerPrice) / 10000

export const getMarkupPercent = (
  providerPrice: number | string,
  ourPrice: number | string,
  exchangeRate: number,
) => {
  const providerPriceUSD = getProviderPriceUSD(providerPrice)
  const ourPriceRUB = Number(ourPrice)
  if (!providerPriceUSD || !exchangeRate) return 0
  return ((ourPriceRUB / (providerPriceUSD * exchangeRate)) - 1) * 100
}

export const createEmptyProduct = (): EditableProduct => ({
  country: '',
  region: '',
  name: '',
  description: '',
  dataAmount: '',
  validityDays: 7,
  dataType: 1,
  providerPrice: 0,
  ourPrice: 0,
  providerId: '',
  isActive: true,
})
