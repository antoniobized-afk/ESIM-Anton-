import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import { MarketingCampaignsController } from './marketing-campaigns.controller';
import { MarketingCampaignsService } from './marketing-campaigns.service';

describe('MarketingCampaignsController', () => {
  const campaigns = {
    createCampaign: jest.fn(),
    getCampaigns: jest.fn(),
    getCampaign: jest.fn(),
    updateCampaign: jest.fn(),
  };
  const controller = new MarketingCampaignsController(
    campaigns as unknown as MarketingCampaignsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('закрывает весь campaign controller JwtAdminGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MarketingCampaignsController);
    expect(guards).toEqual([JwtAdminGuard]);
  });

  it('разрешает SUPPORT read-only list/detail', async () => {
    campaigns.getCampaigns.mockResolvedValue({ data: [], meta: { total: 0 } });
    campaigns.getCampaign.mockResolvedValue({ id: 'campaign_1' });

    await expect(controller.findAll({ page: 1 })).resolves.toEqual(
      expect.objectContaining({ data: [] }),
    );
    await expect(controller.findOne('campaign_1')).resolves.toEqual({ id: 'campaign_1' });
    expect(campaigns.getCampaigns).toHaveBeenCalledWith({ page: 1 });
    expect(campaigns.getCampaign).toHaveBeenCalledWith('campaign_1');
  });

  it('пропускает MANAGER create к backend owner', async () => {
    const dto = {
      name: 'Summer launch',
      utmSource: 'blogger',
      utmMedium: 'social',
      utmCampaign: 'summer-2026',
      targetPath: '/catalog',
    };
    const actor = { id: 'admin_1', type: 'admin' as const, role: 'MANAGER' as const };
    campaigns.createCampaign.mockResolvedValue({ id: 'campaign_1' });

    await expect(controller.create(dto, actor)).resolves.toEqual({ id: 'campaign_1' });
    expect(campaigns.createCampaign).toHaveBeenCalledWith(dto, actor);
  });

  it('делегирует SUPPORT mutations в backend owner role-policy', async () => {
    const actor = { id: 'admin_support', type: 'admin' as const, role: 'SUPPORT' as const };
    const createDto = {
      name: 'Summer launch',
      utmSource: 'blogger',
      utmMedium: 'social',
      utmCampaign: 'summer-2026',
      targetPath: '/catalog',
    };
    campaigns.createCampaign.mockRejectedValue(
      new ForbiddenException('У этой роли нет права изменять маркетинговые кампании'),
    );
    campaigns.updateCampaign.mockRejectedValue(
      new ForbiddenException('У этой роли нет права изменять маркетинговые кампании'),
    );

    await expect(controller.create(createDto, actor)).rejects.toThrow(ForbiddenException);
    await expect(controller.update('campaign_1', { isActive: false }, actor)).rejects.toThrow(
      ForbiddenException,
    );
    expect(campaigns.createCampaign).toHaveBeenCalledWith(createDto, actor);
    expect(campaigns.updateCampaign).toHaveBeenCalledWith('campaign_1', { isActive: false }, actor);
  });
});
