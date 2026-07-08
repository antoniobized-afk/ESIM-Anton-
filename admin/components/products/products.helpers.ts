import type { EditableProduct } from '@/lib/types'
import {
  getProductMarkupPercent,
  getProviderPriceUsd,
} from '@shared/product-pricing'

export const getProviderPriceUSD = getProviderPriceUsd

export const getMarkupPercent = getProductMarkupPercent

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
