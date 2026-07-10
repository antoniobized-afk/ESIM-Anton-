import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CaptureMarketingWebTouchDto } from './dto/capture-marketing-web-touch.dto';
import { ClaimMarketingWebTouchesDto } from './dto/claim-marketing-web-touches.dto';

describe('Marketing web attribution DTO contract', () => {
  it('принимает только campaign code и opaque browser keys для public capture', async () => {
    const valid = plainToInstance(CaptureMarketingWebTouchDto, {
      campaignCode: 'Campaign123',
      visitorToken: 'a'.repeat(64),
      launchKey: 'b'.repeat(64),
    });
    const invalid = plainToInstance(CaptureMarketingWebTouchDto, {
      campaignCode: 'bad code',
      visitorToken: 'visitor-id',
      launchKey: 'launch-id',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['campaignCode', 'visitorToken', 'launchKey']),
    );
  });

  it('разрешает claim без visitor token для direct registration и отклоняет raw identifier', async () => {
    const direct = plainToInstance(ClaimMarketingWebTouchesDto, {});
    const invalid = plainToInstance(ClaimMarketingWebTouchesDto, {
      visitorToken: 'user@example.com',
    });

    await expect(validate(direct)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'visitorToken' })]),
    );
  });
});
