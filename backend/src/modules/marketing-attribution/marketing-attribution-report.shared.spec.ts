import {
  formatMarketingPartner,
  getDefaultMarketingReportDateRange,
  getMarketingAttributionModelLabel,
  isValidUtcDateOnly,
  parseUtcDateOnly,
} from '@shared/marketing-attribution-report';

describe('shared marketing attribution report contract', () => {
  it('строит единое UTC default-окно и проверяет существование даты', () => {
    expect(getDefaultMarketingReportDateRange(new Date('2026-07-10T23:59:59.999Z'))).toEqual({
      dateFrom: '2026-06-11',
      dateTo: '2026-07-10',
    });
    expect(parseUtcDateOnly('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(isValidUtcDateOnly('2026-02-31')).toBe(false);
  });

  it('владеет общими model labels и partner fallback', () => {
    expect(getMarketingAttributionModelLabel('FIRST_TOUCH')).toBe('Первое касание');
    expect(formatMarketingPartner({
      firstName: null,
      lastName: null,
      username: 'travel_anna',
      referralCode: 'partner-code',
    })).toBe('@travel_anna');
  });
});
