import { ForbiddenException } from '@nestjs/common';
import { AuthIdentityProvider, MarketingTouch, MarketingTouchChannel } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
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

function makeService({
  identityUserId = 'user_1',
  telegramId = 123456789n,
}: {
  identityUserId?: string | null;
  telegramId?: bigint | null;
} = {}) {
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    user: {
      findUnique: jest.fn().mockResolvedValue({ telegramId }),
    },
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue(
        identityUserId ? { userId: identityUserId } : null,
      ),
    },
  };
  const capture = {
    captureTrustedTouchInTransaction: jest.fn().mockResolvedValue(touch),
  };
  const lifecycle = {
    finalizeRegistrationAttributionForNewUser: jest.fn().mockResolvedValue(true),
  };

  return {
    prisma,
    capture,
    lifecycle,
    service: new MarketingAttributionTelegramService(
      prisma as unknown as PrismaService,
      capture as unknown as MarketingAttributionCaptureService,
      lifecycle as unknown as MarketingAttributionLifecycleService,
    ),
  };
}

describe('MarketingAttributionTelegramService', () => {
  it('связывает bot ma_ launch только с canonical Telegram user и финализирует registration', async () => {
    const { service, prisma, capture, lifecycle } = makeService();

    await expect(
      service.captureBotTouch({
        userId: 'user_1',
        telegramId: '123456789',
        startParam: 'ma_Campaign123',
        sourceEventKey: 'telegram-bot:101',
      }),
    ).resolves.toEqual({ accepted: true, registrationFinalized: true });

    expect(prisma.userIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerSubject: {
          provider: AuthIdentityProvider.TELEGRAM,
          providerSubject: '123456789',
        },
      },
      select: { userId: true },
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
    const { service, capture, lifecycle } = makeService({ telegramId: 987654321n });

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
    const { service, capture, lifecycle } = makeService({ identityUserId: 'user_2' });

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
    const { service, capture, lifecycle } = makeService({ telegramId: null });

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
});
