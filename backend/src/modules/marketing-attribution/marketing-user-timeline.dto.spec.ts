import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MarketingUserTimelineQueryDto } from './dto/marketing-user-timeline-query.dto';

describe('MarketingUserTimelineQueryDto', () => {
  it('трансформирует bounded pagination query', async () => {
    const valid = plainToInstance(MarketingUserTimelineQueryDto, { page: '2', limit: '100' });
    const invalid = plainToInstance(MarketingUserTimelineQueryDto, { page: '0', limit: '101' });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toEqual({ page: 2, limit: 100 });
    await expect(validate(invalid)).resolves.toHaveLength(2);
  });
});
