import {
  calculateProductPriceRub,
  getProductMarkupPercent,
  getProviderPriceRub,
  getProviderPriceUsd,
  getProviderPriceUsdWithMarkup,
} from '@shared/product-pricing';

describe('Product pricing contract', () => {
  it('keeps provider raw price conversion in one shared owner', () => {
    expect(getProviderPriceUsd(12345)).toBe(1.2345);
    expect(getProviderPriceUsd('50000')).toBe(5);
  });

  it('calculates product RUB price with the sync/reprice formula', () => {
    expect(getProviderPriceUsdWithMarkup(10000, 30)).toBe(1.3);
    expect(calculateProductPriceRub(10000, 95, 30)).toBe(124);
  });

  it('calculates admin/export markup without intermediate RUB rounding', () => {
    const providerPrice = 33333;
    const exchangeRate = 91.23;
    const ourPrice = 400;
    const providerPriceRub = getProviderPriceRub(providerPrice, exchangeRate);

    expect(providerPriceRub).toBeCloseTo(304.096959);
    expect(getProductMarkupPercent(providerPrice, ourPrice, exchangeRate)).toBeCloseTo(
      ((ourPrice / providerPriceRub) - 1) * 100,
    );
  });
});
