import {
  getProductDataTypeLabel,
  isDailyProductDataType,
  isDailyUnlimitedProductDataType,
  isServiceCutOffDailyProductDataType,
  isSpeedReducedDailyProductDataType,
  normalizeProductDataType,
  type ProductDataType,
} from '@shared/product-data-type'
import type { Product } from './api'
import { formatDataAmount } from './utils'

type ProductDataTypeSource = Pick<Product, 'dataType' | 'isUnlimited'>

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
