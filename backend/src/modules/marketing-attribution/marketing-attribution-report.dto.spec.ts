import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  MarketingAttributionOrderDetailsQueryDto,
  MarketingAttributionReportQueryDto,
} from './dto/marketing-attribution-report-query.dto';

describe('MarketingAttributionReportQueryDto', () => {
  it('принимает typed date/channel/model filters', async () => {
    const dto = plainToInstance(MarketingAttributionReportQueryDto, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-10',
      channel: 'TELEGRAM_BOT',
      model: 'FIRST_TOUCH',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { dateFrom: '2026-02-31' },
    { dateTo: '10.07.2026' },
    { channel: 'telegram' },
    { model: 'CURRENT_TOUCH' },
  ])('отклоняет невалидный report filter: %p', async (input) => {
    const dto = plainToInstance(MarketingAttributionReportQueryDto, input);
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('трансформирует bounded pagination drill-down query', async () => {
    const dto = plainToInstance(MarketingAttributionOrderDetailsQueryDto, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-10',
      model: 'LAST_TOUCH',
      source: 'CAMPAIGN',
      campaignId: 'campaign_1',
      page: '2',
      limit: '100',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual(expect.objectContaining({ page: 2, limit: 100 }));
  });

  it.each([
    { source: 'UNKNOWN' },
    { source: 'CAMPAIGN', campaignId: '   ' },
    { source: 'DIRECT', page: '0' },
    { source: 'DIRECT', page: '1.5' },
    { source: 'DIRECT', limit: '101' },
  ])('отклоняет невалидный order drill-down filter: %p', async (input) => {
    const dto = plainToInstance(MarketingAttributionOrderDetailsQueryDto, input);
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
