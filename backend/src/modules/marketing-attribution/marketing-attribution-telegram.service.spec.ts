import { ForbiddenException } from '@nestjs/common';
import { MarketingTouch, MarketingTouchChannel } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingAttributionTelegramService } from './marketing-attribution-telegram.service';

const occurredAt = new Date('2026-07-10T05:00:00.000Z');
const touch: MarketingTouch = {
  id: 'touch_1',
  campaignId: 'campaign_1',
  userId: 'user_1',
  channel: MarketingTouchChannel.TELEGRAM_BOT,
  sourceEventKey: 'telegram-bot:101',
  visitorKeyHash: null,
  occurredAt,
  createdAt: occurredAt,
};

function makeService() {
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const capture = {
    captureTrustedTouchInTransaction: jest.fn().mockResolvedValue(touch),
  };
  const lifecycle = {
    finalizeRegistrationAttributionForNewUser: jest.fn().mockResolvedValue(true),
  };
  const referrals = {
    assertCanonicalTelegramUser: jest.fn().mockResolvedValue(undefined),
    registerReferralLink: jest.fn().mockResolvedValue(null),
  };

  return {
    prisma,
    capture,
    lifecycle,
    referrals,
    service: new MarketingAttributionTelegramService(
      prisma as unknown as PrismaService,
      capture as unknown as MarketingAttributionCaptureService,
      lifecycle as unknown as MarketingAttributionLifecycleService,
      referrals as unknown as ReferralsService,
    ),
  };
}

describe('MarketingAttributionTelegramService', () => {
  it('связывает bot ma_ launch только с canonical Telegram user и финализирует registration', async () => {
    const { service, prisma, capture, lifecycle, referrals } = makeService();

    await expect(
      service.captureBotTouch({
        userId: 'user_1',
        telegramId: '123456789',
        startParam: 'ma_Campaign123',
        sourceEventKey: 'telegram-bot:101',
      }),
    ).resolves.toEqual({ accepted: true, registrationFinalized: true });

    expect(referrals.assertCanonicalTelegramUser).toHaveBeenCalledWith(prisma, {
      userId: 'user_1',
      telegramId: 123456789n,
    });
    expect(capture.captureTrustedTouchInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        campaignCode: 'Campaign123',
        channel: MarketingTouchChannel.TELEGRAM_BOT,
        sourceEventKey: 'telegram-bot:101',
        userId: 'user_1',
      }),
    );
    expect(lifecycle.finalizeRegistrationAttributionForNewUser).toHaveBeenCalledWith(
      prisma,
      'user_1',
    );
  });

  it('не пишет touch при несовпадении Telegram identity', async () => {
    const { service, capture, lifecycle, referrals } = makeService();
    referrals.assertCanonicalTelegramUser.mockRejectedValue(
      new ForbiddenException('Telegram identity не принадлежит указанному пользователю'),
    );

    await expect(
      service.captureBotTouch({
        userId: 'user_1',
        telegramId: '123456789',
        startParam: 'ma_Campaign123',
        sourceEventKey: 'telegram-bot:101',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(capture.captureTrustedTouchInTransaction).not.toHaveBeenCalled();
    expect(lifecycle.finalizeRegistrationAttributionForNewUser).not.toHaveBeenCalled();
  });

  it('не пишет touch, если verified Telegram identity принадлежит другому user', async () => {
    const { service, capture, lifecycle, referrals } = makeService();
    referrals.assertCanonicalTelegramUser.mockRejectedValue(
      new ForbiddenException('Telegram identity не принадлежит указанному пользователю'),
    );

    await expect(
      service.captureMiniAppTouch({
        userId: 'user_1',
        telegramId: '123456789',
        startParam: 'ma_Campaign123',
        sourceEventKey: 'telegram-mini-app:event_1',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(capture.captureTrustedTouchInTransaction).not.toHaveBeenCalled();
    expect(lifecycle.finalizeRegistrationAttributionForNewUser).not.toHaveBeenCalled();
  });

  it('игнорирует ref_ и финализирует direct registration без marketing touch', async () => {
    const { service, capture, lifecycle } = makeService();

    await expect(
      service.captureBotTouch({
        userId: 'user_1',
        telegramId: '123456789',
        startParam: 'ref_partner',
      }),
    ).resolves.toEqual({ accepted: false, registrationFinalized: true });

    expect(capture.captureTrustedTouchInTransaction).not.toHaveBeenCalled();
    expect(lifecycle.finalizeRegistrationAttributionForNewUser).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
    );
  });

  it('использует отдельный Mini App event domain после validated initData', async () => {
    const { service, capture, lifecycle } = makeService();

    await expect(
      service.captureMiniAppTouch({
        userId: 'user_1',
        telegramId: '123456789',
        startParam: 'ma_Campaign123',
        sourceEventKey: 'telegram-mini-app:event_1',
      }),
    ).resolves.toEqual({ accepted: true, registrationFinalized: true });

    expect(capture.captureTrustedTouchInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        channel: MarketingTouchChannel.TELEGRAM_MINI_APP,
        sourceEventKey: 'telegram-mini-app:event_1',
      }),
    );
    expect(lifecycle.finalizeRegistrationAttributionForNewUser).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
    );
  });

  it('делегирует linked campaign referral только после canonical Telegram assertion и touch capture', async () => {
    const { service, prisma, capture, referrals } = makeService();
    capture.captureTrustedTouchInTransaction.mockResolvedValue({
      ...touch,
      campaignReferralLinkId: 'referral_link_1',
    });

    await service.captureBotTouch({
      userId: 'user_1',
      telegramId: '123456789',
      startParam: 'ma_Campaign123',
      sourceEventKey: 'telegram-bot:101',
    });

    expect(referrals.assertCanonicalTelegramUser).toHaveBeenCalledWith(prisma, {
      userId: 'user_1',
      telegramId: 123456789n,
    });
    expect(referrals.registerReferralLink).toHaveBeenCalledWith(
      'user_1',
      'referral_link_1',
      prisma,
    );
    expect(
      referrals.assertCanonicalTelegramUser.mock.invocationCallOrder[0],
    ).toBeLessThan(capture.captureTrustedTouchInTransaction.mock.invocationCallOrder[0]);
    expect(
      capture.captureTrustedTouchInTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(referrals.registerReferralLink.mock.invocationCallOrder[0]);
  });
});
