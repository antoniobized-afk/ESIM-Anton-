import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthIdentityProvider, MarketingTouchChannel } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CaptureMarketingTelegramBotTouchDto } from './dto/capture-marketing-telegram-bot-touch.dto';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import {
  MARKETING_CAMPAIGN_CODE_REGEX,
  MarketingAttributionTransaction,
} from './marketing-attribution.types';

type VerifiedTelegramMiniAppLaunch = {
  userId: string;
  telegramId: string;
  startParam?: string;
  sourceEventKey: string;
};

type TelegramLaunchCapture = {
  userId: string;
  telegramId: bigint;
  startParam?: string;
  sourceEventKey?: string;
  channel: MarketingTouchChannel;
};

const TELEGRAM_CAPTURE_TRANSACTION_MAX_WAIT_MS = 10_000;
const TELEGRAM_CAPTURE_TRANSACTION_TIMEOUT_MS = 60_000;

@Injectable()
export class MarketingAttributionTelegramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capture: MarketingAttributionCaptureService,
    private readonly lifecycle: MarketingAttributionLifecycleService,
  ) {}

  async captureBotTouch(dto: CaptureMarketingTelegramBotTouchDto) {
    return this.captureVerifiedLaunch({
      userId: dto.userId,
      telegramId: BigInt(dto.telegramId),
      startParam: dto.startParam,
      sourceEventKey: dto.sourceEventKey,
      channel: MarketingTouchChannel.TELEGRAM_BOT,
    });
  }

  async captureMiniAppTouch(input: VerifiedTelegramMiniAppLaunch) {
    return this.captureVerifiedLaunch({
      ...input,
      telegramId: BigInt(input.telegramId),
      channel: MarketingTouchChannel.TELEGRAM_MINI_APP,
    });
  }

  private async captureVerifiedLaunch(input: TelegramLaunchCapture) {
    const campaignCode = this.campaignCodeFromStartParam(input.startParam);
    if (campaignCode && !input.sourceEventKey) {
      throw new BadRequestException('Для Telegram campaign touch нужен ключ идемпотентности');
    }

    return this.prisma.$transaction(
      async (tx) => {
        await this.assertCanonicalTelegramUser(tx, input.userId, input.telegramId);

        const touch = campaignCode
          ? await this.capture.captureTrustedTouchInTransaction(tx, {
              campaignCode,
              channel: input.channel,
              sourceEventKey: input.sourceEventKey!,
              userId: input.userId,
            })
          : null;
        const registrationFinalized =
          await this.lifecycle.finalizeRegistrationAttributionForNewUser(tx, input.userId);

        return {
          accepted: touch !== null,
          registrationFinalized,
        };
      },
      {
        maxWait: TELEGRAM_CAPTURE_TRANSACTION_MAX_WAIT_MS,
        timeout: TELEGRAM_CAPTURE_TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  private async assertCanonicalTelegramUser(
    tx: MarketingAttributionTransaction,
    userId: string,
    telegramId: bigint,
  ) {
    const [user, identity] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: { telegramId: true },
      }),
      tx.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthIdentityProvider.TELEGRAM,
            providerSubject: telegramId.toString(),
          },
        },
        select: { userId: true },
      }),
    ]);

    if (
      identity?.userId !== userId ||
      (user?.telegramId !== null && user?.telegramId !== telegramId)
    ) {
      throw new ForbiddenException('Telegram identity не принадлежит указанному пользователю');
    }
  }

  private campaignCodeFromStartParam(startParam?: string) {
    if (!startParam?.startsWith('ma_')) return null;

    const campaignCode = startParam.slice(3);
    return MARKETING_CAMPAIGN_CODE_REGEX.test(campaignCode) ? campaignCode : null;
  }
}
