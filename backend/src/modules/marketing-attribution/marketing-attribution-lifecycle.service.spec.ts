import { NotFoundException } from '@nestjs/common';
import { MarketingRegistrationAttributionStatus, MarketingTouchChannel } from '@prisma/client';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingAttributionTransaction } from './marketing-attribution.types';

const firstTouch = {
  id: 'touch_first',
  campaignId: 'campaign_1',
  userId: 'user_1',
  channel: MarketingTouchChannel.WEB,
  sourceEventKey: 'web:first',
  visitorKeyHash: null,
  occurredAt: new Date('2026-07-09T10:00:00.000Z'),
  createdAt: new Date('2026-07-09T10:00:00.000Z'),
  campaign: {
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
    createdAt: new Date('2026-07-09T10:00:00.000Z'),
    updatedAt: new Date('2026-07-09T10:00:00.000Z'),
  },
};

function makeTransaction() {
  const state = {
    id: 'state_1',
    userId: 'user_1',
    firstTouchId: firstTouch.id,
    lastTouchId: firstTouch.id,
    registrationStatus: MarketingRegistrationAttributionStatus.PENDING,
    firstTouch,
    lastTouch: firstTouch,
  };
  const tx = {
    userMarketingAttribution: {
      create: jest.fn().mockResolvedValue(state),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(state),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'user_1' }]),
    marketingTouch: {
      findUnique: jest.fn().mockResolvedValue(firstTouch),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'user_1', parentOrderId: null }),
    },
    orderMarketingAttribution: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'snapshot_1', orderId: 'order_1' }),
    },
  };

  return { state, tx };
}

describe('MarketingAttributionLifecycleService', () => {
  it('сериализует первичное создание state на canonical user row', async () => {
    const { state, tx } = makeTransaction();
    const service = new MarketingAttributionLifecycleService();
    tx.userMarketingAttribution.findUnique.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(
      service.ensureRegistrationState(tx as unknown as MarketingAttributionTransaction, 'user_1'),
    ).resolves.toEqual(state);

    const lockSql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(lockSql).toContain('FROM "users"');
    expect(lockSql).toContain('FOR NO KEY UPDATE');
    expect(tx.userMarketingAttribution.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.userMarketingAttribution.findUnique.mock.invocationCallOrder[1],
    );
    expect(tx.userMarketingAttribution.findUnique.mock.invocationCallOrder[1]).toBeLessThan(
      tx.userMarketingAttribution.create.mock.invocationCallOrder[0],
    );
  });

  it('помечает eligibility только в transaction создания нового аккаунта', async () => {
    const { tx } = makeTransaction();
    const service = new MarketingAttributionLifecycleService();

    await service.initializeRegistrationAttributionForNewUser(
      tx as unknown as MarketingAttributionTransaction,
      'user_1',
    );

    expect(tx.userMarketingAttribution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        registrationEligibleAt: expect.any(Date),
      }),
    });
  });

  it('не финализирует registration snapshot для существующего пользователя без eligibility', async () => {
    const { tx } = makeTransaction();
    const service = new MarketingAttributionLifecycleService();
    tx.userMarketingAttribution.findUnique.mockResolvedValue({
      id: 'state_1',
      registrationEligibleAt: null,
    });

    await expect(
      service.finalizeRegistrationAttributionForNewUser(
        tx as unknown as MarketingAttributionTransaction,
        'user_1',
      ),
    ).resolves.toBe(false);

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.userMarketingAttribution.updateMany).not.toHaveBeenCalled();
  });

  it('после user lock переиспользует state, созданный конкурентной transaction', async () => {
    const { state, tx } = makeTransaction();
    const service = new MarketingAttributionLifecycleService();
    tx.userMarketingAttribution.findUnique.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(state);

    await expect(
      service.ensureRegistrationState(tx as unknown as MarketingAttributionTransaction, 'user_1'),
    ).resolves.toEqual(state);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.userMarketingAttribution.create).not.toHaveBeenCalled();
  });

  it('отклоняет отсутствующего пользователя до создания state', async () => {
    const { tx } = makeTransaction();
    const service = new MarketingAttributionLifecycleService();
    tx.userMarketingAttribution.findUnique.mockReset().mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.ensureRegistrationState(tx as unknown as MarketingAttributionTransaction, 'missing_user'),
    ).rejects.toThrow(NotFoundException);

    expect(tx.userMarketingAttribution.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.userMarketingAttribution.create).not.toHaveBeenCalled();
  });

  it('ведёт current first/last через compare-and-set, а не через перезапись state', async () => {
    const { tx } = makeTransaction();
    const service = new MarketingAttributionLifecycleService();

    const result = await service.recordCurrentTouch(tx as unknown as MarketingAttributionTransaction, {
      userId: 'user_1',
      touch: firstTouch,
    });

    expect(tx.marketingTouch.findUnique).not.toHaveBeenCalled();
    expect(tx.userMarketingAttribution.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ firstTouchOccurredAt: { gt: firstTouch.occurredAt } }]),
        }),
      }),
    );
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.userMarketingAttribution.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ lastTouchOccurredAt: { lt: firstTouch.occurredAt } }]),
        }),
      }),
    );
    expect(result).toEqual({ stateId: 'state_1', firstTouchUpdated: true, lastTouchUpdated: true });
  });

  it('блокирует state, перечитывает current touches и делает registration snapshot final', async () => {
    const { state, tx } = makeTransaction();
    const service = new MarketingAttributionLifecycleService();
    const latestTouch = {
      ...firstTouch,
      id: 'touch_latest',
      sourceEventKey: 'web:latest',
      occurredAt: new Date('2026-07-09T11:00:00.000Z'),
      campaign: {
        ...firstTouch.campaign,
        shortCode: 'LatestCode123',
      },
    };
    const stateAfterCurrentTouch = {
      ...state,
      lastTouchId: latestTouch.id,
      lastTouch: latestTouch,
    };
    tx.userMarketingAttribution.findUnique
      .mockReset()
      .mockResolvedValueOnce({ id: state.id, registrationEligibleAt: new Date('2026-07-09T09:00:00.000Z') })
      .mockResolvedValueOnce(stateAfterCurrentTouch)
      .mockResolvedValueOnce(stateAfterCurrentTouch);

    await expect(
      service.finalizeRegistrationAttributionForNewUser(
        tx as unknown as MarketingAttributionTransaction,
        'user_1',
      ),
    ).resolves.toBe(true);

    const lockSql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(lockSql).toContain('FROM "user_marketing_attribution"');
    expect(lockSql).toContain('FOR UPDATE');
    expect(tx.userMarketingAttribution.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.userMarketingAttribution.findUnique.mock.invocationCallOrder[1],
    );
    expect(tx.userMarketingAttribution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ registrationStatus: MarketingRegistrationAttributionStatus.PENDING }),
        data: expect.objectContaining({
          registrationStatus: MarketingRegistrationAttributionStatus.ATTRIBUTED,
          registrationFirstTouchId: 'touch_first',
          registrationLastCampaignCode: 'LatestCode123',
        }),
      }),
    );
  });

  it('создаёт immutable order snapshot через conflict-safe insert и не создаёт его для top-up', async () => {
    const { tx } = makeTransaction();
    const service = new MarketingAttributionLifecycleService();

    await service.createOrderSnapshot(tx as unknown as MarketingAttributionTransaction, {
      orderId: 'order_1',
      userId: 'user_1',
    });

    expect(tx.orderMarketingAttribution.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstTouchId: 'touch_first',
          lastCampaignCode: 'AbCdEfGh1234',
        }),
        skipDuplicates: true,
      }),
    );
    expect(tx.orderMarketingAttribution.findUnique).toHaveBeenCalledWith({
      where: { orderId: 'order_1' },
    });

    tx.order.findUnique.mockResolvedValueOnce({ userId: 'user_1', parentOrderId: 'primary_order_1' });
    await expect(
      service.createOrderSnapshot(tx as unknown as MarketingAttributionTransaction, {
        orderId: 'topup_1',
        userId: 'user_1',
      }),
    ).resolves.toBeNull();
  });

});
