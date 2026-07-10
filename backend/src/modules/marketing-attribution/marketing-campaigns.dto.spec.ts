import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMarketingCampaignDto } from './dto/create-marketing-campaign.dto';
import { MarketingCampaignsQueryDto } from './dto/marketing-campaigns-query.dto';
import { UpdateMarketingCampaignDto } from './dto/update-marketing-campaign.dto';

describe('Marketing campaign DTO contract', () => {
  it('принимает valid create и отклоняет external targetPath', async () => {
    const valid = plainToInstance(CreateMarketingCampaignDto, {
      name: 'Summer launch',
      utmSource: 'blogger',
      utmMedium: 'social',
      utmCampaign: 'summer-2026',
      targetPath: '/catalog?country=TH',
    });
    const invalid = plainToInstance(CreateMarketingCampaignDto, {
      ...valid,
      targetPath: '//external.example/path',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'targetPath' })]),
    );
  });

  it.each(['', '   '])('отклоняет пустой referralLinkId в create и update DTO', async (referralLinkId) => {
    const create = plainToInstance(CreateMarketingCampaignDto, {
      name: 'Summer launch',
      utmSource: 'blogger',
      utmMedium: 'social',
      utmCampaign: 'summer-2026',
      targetPath: '/catalog',
      referralLinkId,
    });
    const update = plainToInstance(UpdateMarketingCampaignDto, { referralLinkId });

    await expect(validate(create)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'referralLinkId' })]),
    );
    await expect(validate(update)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'referralLinkId' })]),
    );
  });

  it('валидирует query bounds и не превращает garbage boolean в false', async () => {
    const invalid = plainToInstance(MarketingCampaignsQueryDto, {
      page: '0',
      limit: '101',
      isActive: 'not-a-boolean',
    });
    const properties = (await validate(invalid)).map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(['page', 'limit', 'isActive']));
  });

  it('преобразует explicit false и отклоняет invalid update boolean', async () => {
    const query = plainToInstance(MarketingCampaignsQueryDto, { isActive: 'false' });
    const stringUpdate = plainToInstance(UpdateMarketingCampaignDto, { isActive: 'false' });
    const nullUpdate = plainToInstance(UpdateMarketingCampaignDto, { isActive: null });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.isActive).toBe(false);
    await expect(validate(stringUpdate)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'isActive' })]),
    );
    await expect(validate(nullUpdate)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'isActive' })]),
    );
  });
});
