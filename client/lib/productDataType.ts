import type { Product } from './api'
import { formatDataAmount } from './utils'

export const PRODUCT_DATA_TYPES = [1, 2, 3, 4] as const

export type ProductDataType = (typeof PRODUCT_DATA_TYPES)[number]

const PRODUCT_DATA_TYPE_LABELS: Record<ProductDataType, string> = {
  1: 'Пакет данных на весь срок',
  2: 'Дневной лимит (снижение скорости)',
  3: 'Дневной лимит (отключение услуги)',
  4: 'Дневной безлимит',
}

const LEGACY_DAILY_PRODUCT_DATA_TYPE_LABEL = 'Дневной тариф (тип не определён)'

type ProductDataTypeSource = Pick<Product, 'dataType' | 'isUnlimited'>

function normalizeProductDataType(value: unknown): ProductDataType | undefined {
  let numericValue: number | undefined

  if (typeof value === 'number' && Number.isInteger(value)) {
    numericValue = value
  } else if (typeof value === 'string') {
    const trimmedValue = value.trim()
    numericValue = /^[1-4]$/.test(trimmedValue) ? Number(trimmedValue) : undefined
  }

  return PRODUCT_DATA_TYPES.includes(numericValue as ProductDataType)
    ? (numericValue as ProductDataType)
    : undefined
}

function getProductDataTypeLabel(value: unknown, fallbackIsUnlimited = false): string {
  const normalized = normalizeProductDataType(value)
  if (normalized) return PRODUCT_DATA_TYPE_LABELS[normalized]

  return fallbackIsUnlimited ? LEGACY_DAILY_PRODUCT_DATA_TYPE_LABEL : PRODUCT_DATA_TYPE_LABELS[1]
}

function isDailyProductDataType(value: unknown, fallbackIsUnlimited = false): boolean {
  const normalized = normalizeProductDataType(value)
  return normalized === undefined ? fallbackIsUnlimited : normalized !== 1
}

function isSpeedReducedDailyProductDataType(value: unknown): boolean {
  return normalizeProductDataType(value) === 2
}

function isServiceCutOffDailyProductDataType(value: unknown): boolean {
  return normalizeProductDataType(value) === 3
}

function isDailyUnlimitedProductDataType(value: unknown): boolean {
  return normalizeProductDataType(value) === 4
}

export function getClientProductDataType(product: ProductDataTypeSource): ProductDataType | undefined {
  return normalizeProductDataType(product.dataType)
}

function isLegacyDailyProduct(product: ProductDataTypeSource): boolean {
  return getClientProductDataType(product) === undefined && product.isUnlimited
}

export function isClientDailyProduct(product: ProductDataTypeSource): boolean {
  const dataType = getClientProductDataType(product)
  return isDailyProductDataType(dataType, product.isUnlimited)
}

export function getClientProductDataTypeLabel(product: ProductDataTypeSource): string {
  return getProductDataTypeLabel(product.dataType, product.isUnlimited)
}

export function getProductListPeriodText(
  product: Pick<Product, 'dataType' | 'isUnlimited' | 'validityDays'>,
): string {
  const dataType = getClientProductDataType(product)

  if (isDailyUnlimitedProductDataType(dataType)) return 'дневной безлимит'
  if (isDailyProductDataType(dataType)) return 'в день'
  if (isLegacyDailyProduct(product)) return 'дневной тариф'

  return `на ${product.validityDays} дн.`
}

export function getProductListCaption(
  product: Pick<Product, 'dataType' | 'isUnlimited' | 'speed'>,
): string {
  const dataType = getClientProductDataType(product)

  if (isSpeedReducedDailyProductDataType(dataType)) {
    return product.speed
      ? `Дневной лимит. После лимита: ${product.speed}`
      : 'Дневной лимит. После лимита скорость снижается'
  }

  if (isServiceCutOffDailyProductDataType(dataType)) {
    return 'Дневной лимит. После лимита доступ отключается до следующего дня'
  }

  if (isDailyUnlimitedProductDataType(dataType)) {
    return 'Дневной безлимит без ограничения объёма'
  }

  if (isLegacyDailyProduct(product)) {
    return 'Дневной тариф. Тип лимита уточняется'
  }

  return 'Весь объём интернета на срок тарифа'
}

export function getProductHeaderDescription(
  product: Pick<Product, 'dataType' | 'isUnlimited' | 'speed'>,
): string {
  const dataType = getClientProductDataType(product)

  if (isSpeedReducedDailyProductDataType(dataType)) {
    return product.speed
      ? `Дневной лимит обновляется каждый день. После лимита скорость снижается до ${product.speed}.`
      : 'Дневной лимит обновляется каждый день. После лимита скорость снижается.'
  }

  if (isServiceCutOffDailyProductDataType(dataType)) {
    return 'Дневной лимит обновляется каждый день. После лимита доступ отключается до следующего дня.'
  }

  if (isDailyUnlimitedProductDataType(dataType)) {
    return 'Дневной безлимит на выбранное количество дней.'
  }

  if (isLegacyDailyProduct(product)) {
    return 'Дневной тариф на выбранное количество дней. Тип дневного лимита уточняется.'
  }

  return 'Весь объём можно использовать в любой день до окончания срока.'
}

export function getProductTrafficText(
  product: Pick<Product, 'dataAmount' | 'dataType' | 'isUnlimited'>,
): string {
  const dataType = getClientProductDataType(product)
  const dataAmount = formatDataAmount(product.dataAmount)

  return isDailyProductDataType(dataType, product.isUnlimited)
    && !isDailyUnlimitedProductDataType(dataType)
    ? `${dataAmount} / день`
    : dataAmount
}

export function getProductLimitPolicyText(
  product: Pick<Product, 'dataType' | 'isUnlimited' | 'speed'>,
): string | null {
  const dataType = getClientProductDataType(product)

  if (isSpeedReducedDailyProductDataType(dataType)) {
    return product.speed
      ? `После дневного лимита: ${product.speed}`
      : 'После дневного лимита скорость снижается'
  }

  if (isServiceCutOffDailyProductDataType(dataType)) {
    return 'После дневного лимита доступ отключается до следующего дня'
  }

  return null
}
