export type ProductPricingNumeric = number | string | { toString(): string } | null | undefined;

export const PRODUCT_PROVIDER_PRICE_UNIT_DIVISOR = 10000;

export function toProductPricingNumber(value: ProductPricingNumeric): number | null {
  if (value === null || value === undefined || value === '') return null;

  const parsed = typeof value === 'object'
    ? Number(value.toString())
    : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function getProviderPriceUsdOrNull(providerPrice: ProductPricingNumeric): number | null {
  const rawProviderPrice = toProductPricingNumber(providerPrice);
  return rawProviderPrice === null ? null : rawProviderPrice / PRODUCT_PROVIDER_PRICE_UNIT_DIVISOR;
}

export function getProviderPriceUsd(providerPrice: ProductPricingNumeric): number {
  return getProviderPriceUsdOrNull(providerPrice) ?? 0;
}

export function getProviderPriceRubOrNull(
  providerPrice: ProductPricingNumeric,
  exchangeRate: ProductPricingNumeric,
): number | null {
  const providerPriceUsd = getProviderPriceUsdOrNull(providerPrice);
  const rate = toProductPricingNumber(exchangeRate);

  return providerPriceUsd === null || rate === null ? null : providerPriceUsd * rate;
}

export function getProviderPriceRub(
  providerPrice: ProductPricingNumeric,
  exchangeRate: ProductPricingNumeric,
): number {
  return getProviderPriceRubOrNull(providerPrice, exchangeRate) ?? 0;
}

export function getProviderPriceUsdWithMarkup(
  providerPrice: ProductPricingNumeric,
  markupPercent: ProductPricingNumeric,
): number {
  const providerPriceUsd = getProviderPriceUsd(providerPrice);
  const markup = toProductPricingNumber(markupPercent) ?? 0;

  return providerPriceUsd * (1 + markup / 100);
}

export function calculateProductPriceRub(
  providerPrice: ProductPricingNumeric,
  exchangeRate: ProductPricingNumeric,
  markupPercent: ProductPricingNumeric,
): number {
  const priceWithMarkupUsd = getProviderPriceUsdWithMarkup(providerPrice, markupPercent);
  const rate = toProductPricingNumber(exchangeRate) ?? 0;

  return Math.round(priceWithMarkupUsd * rate);
}

export function getProductMarkupPercent(
  providerPrice: ProductPricingNumeric,
  ourPrice: ProductPricingNumeric,
  exchangeRate: ProductPricingNumeric,
): number {
  const providerPriceRub = getProviderPriceRubOrNull(providerPrice, exchangeRate);
  const ourPriceRub = toProductPricingNumber(ourPrice);

  if (providerPriceRub === null || providerPriceRub <= 0 || ourPriceRub === null) return 0;

  return ((ourPriceRub / providerPriceRub) - 1) * 100;
}
