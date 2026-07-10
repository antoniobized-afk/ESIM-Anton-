import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketingCampaignAuditEvent, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  MARKETING_CAMPAIGN_CODE_LENGTH,
  MARKETING_CAMPAIGN_CODE_REGEX,
} from './marketing-attribution.types';
import { MarketingCampaignsService } from './marketing-campaigns.service';

const baseCampaign = {
  id: 'campaign_1',
  shortCode: 'AbCdEfGh1234',
  name: 'Summer launch',
  utmSource: 'blogger',
  utmMedium: 'social',
  utmCampaign: 'summer-2026',
  utmContent: null,
  utmTerm: null,
  targetPath: '/catalog',
  referralLinkId: null,
  isActive: true,
  deactivatedAt: null,
  createdAt: new Date('2026-07-10T00:00:00.000Z'),
  updatedAt: new Date('2026-07-10T00:00:00.000Z'),
  referralLink: null,
  _count: { touches: 0 },
};

function makeService(
  campaign = baseCampaign,
  configValues: Record<string, string | undefined> = {
    SITE_URL: 'https://app.example.test',
    TELEGRAM_BOT_USERNAME: 'mojo_mobile_bot',
  },
) {
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([{ id: campaign.id }]),
    referralLink: {
      findUnique: jest.fn(),
    },
    marketingCampaign: {
      create: jest.fn().mockImplementation(({ data }) => ({ ...campaign, ...data })),
      findMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(campaign),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({ ...campaign, ...data })),
    },
    marketingCampaignAudit: {
      create: jest.fn(),
    },
  };
  const config = {
    get: jest.fn().mockImplementation((key: string) => configValues[key]),
  };

  return {
    prisma,
    config,
    service: new MarketingCampaignsService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    ),
  };
}

describe('MarketingCampaignsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('резолвит link config один раз на страницу campaign', async () => {
    const { service, prisma, config } = makeService();
    prisma.marketingCampaign.findMany.mockResolvedValue([
      baseCampaign,
      { ...baseCampaign, id: 'campaign_2', shortCode: 'ZyXwVuTs9876' },
    ]);
    prisma.marketingCampaign.count.mockResolvedValue(2);

    const result = await service.getCampaigns();

    expect(result.data).toHaveLength(2);
    expect(prisma.marketingCampaign.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.marketingCampaign.count).toHaveBeenCalledTimes(1);
    expect(config.get).toHaveBeenCalledTimes(2);
  });

  it('запрашивает touch count только для freeze guard перед update', async () => {
    const { service, prisma } = makeService();
    prisma.marketingCampaign.findMany.mockResolvedValue([baseCampaign]);
    prisma.marketingCampaign.count.mockResolvedValue(1);

    await service.getCampaigns();
    await service.getCampaign('campaign_1');
    await service.createCampaign(
      {
        name: 'Summer launch',
        utmSource: 'blogger',
        utmMedium: 'social',
        utmCampaign: 'summer-2026',
        targetPath: '/catalog',
      },
      { id: 'admin_1', role: 'MANAGER' },
    );
    await service.updateCampaign(
      'campaign_1',
      { isActive: false },
      { id: 'admin_1', role: 'MANAGER' },
    );

    expect(prisma.marketingCampaign.findMany.mock.calls[0][0].include).not.toHaveProperty('_count');
    expect(prisma.marketingCampaign.findUnique.mock.calls[0][0].include).not.toHaveProperty('_count');
    expect(prisma.marketingCampaign.create.mock.calls[0][0].include).not.toHaveProperty('_count');
    expect(prisma.marketingCampaign.findUnique.mock.calls[1][0].include).toEqual(
      expect.objectContaining({ _count: { select: { touches: true } } }),
    );
    expect(prisma.marketingCampaign.update.mock.calls[0][0].include).not.toHaveProperty('_count');
  });

  it('отдаёт curated campaign response без Prisma relation internals', async () => {
    const { service, prisma } = makeService();
    const campaign = {
      ...baseCampaign,
      referralLinkId: 'referral_link_1',
      referralLink: {
        id: 'referral_link_1',
        code: 'PARTNER',
        label: 'Partner offer',
        userId: 'referral_owner_1',
        isActive: true,
      },
      _count: { touches: 3 },
    };
    prisma.marketingCampaign.findMany.mockResolvedValue([campaign]);
    prisma.marketingCampaign.count.mockResolvedValue(1);
    prisma.marketingCampaign.findUnique.mockResolvedValue(campaign);

    const [list, detail] = await Promise.all([
      service.getCampaigns(),
      service.getCampaign('campaign_1'),
    ]);

    for (const response of [list.data[0], detail]) {
      expect(response).toEqual(
        expect.objectContaining({
          referralLink: {
            id: 'referral_link_1',
            code: 'PARTNER',
            label: 'Partner offer',
            isActive: true,
          },
        }),
      );
      expect(response).not.toHaveProperty('_count');
      expect(response.referralLink).not.toHaveProperty('userId');
    }
  });

  it('создаёт campaign только для MANAGER/SUPER_ADMIN и возвращает backend-generated links', async () => {
    const { service, prisma } = makeService();

    const result = await service.createCampaign(
      {
        name: '  Summer launch  ',
        utmSource: 'blogger',
        utmMedium: 'social',
        utmCampaign: 'summer-2026',
        targetPath: '/catalog',
      },
      { id: 'admin_1', role: 'MANAGER' },
    );

    expect(prisma.marketingCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Summer launch',
          shortCode: expect.stringMatching(MARKETING_CAMPAIGN_CODE_REGEX),
        }),
      }),
    );
    const createdShortCode = prisma.marketingCampaign.create.mock.calls[0][0].data.shortCode;
    expect(createdShortCode).toHaveLength(MARKETING_CAMPAIGN_CODE_LENGTH);
    expect(prisma.marketingCampaignAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: MarketingCampaignAuditEvent.CREATED,
        actorId: 'admin_1',
        actorRole: 'MANAGER',
      }),
    });
    expect(result.links).toEqual({
      web: expect.stringContaining('/r/'),
      telegramBot: expect.stringContaining('start=ma_'),
      telegramMiniApp: expect.stringContaining('startapp=ma_'),
    });
    expect(result.links.web).toContain('utm_source=blogger');
  });

  it.each([
    [
      'без SITE_URL',
      { SITE_URL: undefined, TELEGRAM_BOT_USERNAME: 'mojo_mobile_bot' },
    ],
    [
      'с unsafe SITE_URL protocol',
      { SITE_URL: 'javascript:alert(1)', TELEGRAM_BOT_USERNAME: 'mojo_mobile_bot' },
    ],
    [
      'без valid TELEGRAM_BOT_USERNAME',
      { SITE_URL: 'https://app.example.test', TELEGRAM_BOT_USERNAME: 'bad-name' },
    ],
  ])('отклоняет create %s до transaction и DB write', async (_case, configValues) => {
    const { service, prisma } = makeService(baseCampaign, configValues);

    await expect(
      service.createCampaign(
        {
          name: 'Summer launch',
          utmSource: 'blogger',
          utmMedium: 'social',
          utmCampaign: 'summer-2026',
          targetPath: '/catalog',
        },
        { id: 'admin_1', role: 'MANAGER' },
      ),
    ).rejects.toThrow(InternalServerErrorException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.create).not.toHaveBeenCalled();
    expect(prisma.marketingCampaignAudit.create).not.toHaveBeenCalled();
  });

  it('отклоняет update с invalid link config до campaign transaction и DB write', async () => {
    const { service, prisma } = makeService(baseCampaign, {
      SITE_URL: undefined,
      TELEGRAM_BOT_USERNAME: 'mojo_mobile_bot',
    });

    await expect(
      service.updateCampaign(
        'campaign_1',
        { isActive: false },
        { id: 'admin_1', role: 'MANAGER' },
      ),
    ).rejects.toThrow(InternalServerErrorException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.update).not.toHaveBeenCalled();
    expect(prisma.marketingCampaignAudit.create).not.toHaveBeenCalled();
  });

  it('повторяет create с новым short code после P2002 collision', async () => {
    const { service, prisma } = makeService();
    prisma.marketingCampaign.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('short code collision', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['shortCode'] },
      }),
    );

    await expect(
      service.createCampaign(
        {
          name: 'Summer launch',
          utmSource: 'blogger',
          utmMedium: 'social',
          utmCampaign: 'summer-2026',
          targetPath: '/catalog',
        },
        { id: 'admin_1', role: 'MANAGER' },
      ),
    ).resolves.toEqual(expect.objectContaining({ links: expect.any(Object) }));

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.marketingCampaign.create).toHaveBeenCalledTimes(2);
    expect(prisma.marketingCampaignAudit.create).toHaveBeenCalledTimes(1);
  });

  it('возвращает ConflictException после исчерпания short code collision retries', async () => {
    const { service, prisma } = makeService();
    prisma.marketingCampaign.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('short code collision', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['shortCode'] },
      }),
    );

    await expect(
      service.createCampaign(
        {
          name: 'Summer launch',
          utmSource: 'blogger',
          utmMedium: 'social',
          utmCampaign: 'summer-2026',
          targetPath: '/catalog',
        },
        { id: 'admin_1', role: 'MANAGER' },
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
    expect(prisma.marketingCampaign.create).toHaveBeenCalledTimes(5);
    expect(prisma.marketingCampaignAudit.create).not.toHaveBeenCalled();
  });

  it('проверяет referral link до campaign transaction', async () => {
    const { service, prisma } = makeService();
    prisma.referralLink.findUnique.mockResolvedValue({ id: 'referral_link_1' });

    await service.createCampaign(
      {
        name: 'Partner launch',
        utmSource: 'partner',
        utmMedium: 'referral',
        utmCampaign: 'partner-2026',
        targetPath: '/catalog',
        referralLinkId: 'referral_link_1',
      },
      { id: 'admin_1', role: 'MANAGER' },
    );

    expect(prisma.referralLink.findUnique).toHaveBeenCalledWith({
      where: { id: 'referral_link_1' },
      select: { id: true },
    });
    expect(prisma.marketingCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referralLinkId: 'referral_link_1' }),
      }),
    );
  });

  it('не начинает campaign transaction для missing referral link', async () => {
    const { service, prisma } = makeService();
    prisma.referralLink.findUnique.mockResolvedValue(null);

    await expect(
      service.createCampaign(
        {
          name: 'Partner launch',
          utmSource: 'partner',
          utmMedium: 'referral',
          utmCampaign: 'partner-2026',
          targetPath: '/catalog',
          referralLinkId: 'missing_link',
        },
        { id: 'admin_1', role: 'MANAGER' },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.create).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('отклоняет blank referralLinkId %p до lookup, mutation и disconnect', async (referralLinkId) => {
    const { service, prisma } = makeService({
      ...baseCampaign,
      referralLinkId: 'referral_link_1',
      referralLink: { id: 'referral_link_1', code: 'PARTNER', label: null, userId: 'user_1', isActive: true },
    });
    const actor = { id: 'admin_1', role: 'MANAGER' as const };

    await expect(
      service.createCampaign(
        {
          name: 'Partner launch',
          utmSource: 'partner',
          utmMedium: 'referral',
          utmCampaign: 'partner-2026',
          targetPath: '/catalog',
          referralLinkId,
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.referralLink.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.create).not.toHaveBeenCalled();

    await expect(
      service.updateCampaign('campaign_1', { referralLinkId }, actor),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.referralLink.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.update).not.toHaveBeenCalled();
  });

  it('отклоняет null isActive до campaign row lock и mutation', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.updateCampaign(
        'campaign_1',
        { isActive: null },
        { id: 'admin_1', role: 'MANAGER' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.update).not.toHaveBeenCalled();
  });

  it('отклоняет мутацию кампании для SUPPORT до любой записи', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.createCampaign(
        {
          name: 'Summer launch',
          utmSource: 'blogger',
          utmMedium: 'social',
          utmCampaign: 'summer-2026',
          targetPath: '/catalog',
        },
        { id: 'admin_support', role: 'SUPPORT' },
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.updateCampaign(
        'campaign_1',
        { isActive: false },
        { id: 'admin_support', role: 'SUPPORT' },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.marketingCampaign.create).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.findUnique).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.update).not.toHaveBeenCalled();
  });

  it('замораживает UTM, targetPath и referral link после первого touch', async () => {
    const { service, prisma } = makeService({
      ...baseCampaign,
      _count: { touches: 1 },
    });

    await expect(
      service.updateCampaign(
        'campaign_1',
        { utmCampaign: 'another-campaign' },
        { id: 'admin_1', role: 'SUPER_ADMIN' },
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.marketingCampaign.update).not.toHaveBeenCalled();
  });

  it('берёт campaign row lock до проверки touches и mutation', async () => {
    const { service, prisma } = makeService();

    await service.updateCampaign(
      'campaign_1',
      { isActive: false },
      { id: 'admin_1', role: 'SUPER_ADMIN' },
    );

    const lockSql = prisma.$queryRaw.mock.calls[0][0].join('');
    expect(lockSql).toContain('FROM "marketing_campaigns"');
    expect(lockSql).toContain('FOR UPDATE');
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.marketingCampaign.findUnique.mock.invocationCallOrder[0],
    );
    expect(prisma.marketingCampaign.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.marketingCampaign.update.mock.invocationCallOrder[0],
    );
  });

  it('разрешает деактивацию уже использованной кампании и фиксирует audit event', async () => {
    const { service, prisma } = makeService({
      ...baseCampaign,
      _count: { touches: 1 },
    });

    await service.updateCampaign(
      'campaign_1',
      { isActive: false },
      { id: 'admin_1', role: 'SUPER_ADMIN' },
    );

    expect(prisma.marketingCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false, deactivatedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.marketingCampaignAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: MarketingCampaignAuditEvent.DEACTIVATED }),
    });
  });
});
