import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MarketingTouchChannel } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { CaptureMarketingTelegramBotTouchDto } from './dto/capture-marketing-telegram-bot-touch.dto';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import {
  MARKETING_CAMPAIGN_CODE_REGEX,
  MarketingAttributionTransaction,
  VerifiedTelegramMiniAppLaunch,
} from './marketing-attribution.types';

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
    private readonly referrals: ReferralsService,
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
        await this.referrals.assertCanonicalTelegramUser(tx, {
          userId: input.userId,
          telegramId: input.telegramId,
        });

        const touch = campaignCode
          ? await this.capture.captureTrustedTouchInTransaction(tx, {
              campaignCode,
              channel: input.channel,
              sourceEventKey: input.sourceEventKey!,
              userId: input.userId,
            })
          : null;
        if (touch?.campaignReferralLinkId) {
          await this.referrals.registerReferralLink(
            input.userId,
            touch.campaignReferralLinkId,
            tx,
          );
        }
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

  private campaignCodeFromStartParam(startParam?: string) {
    if (!startParam?.startsWith('ma_')) return null;

    const campaignCode = startParam.slice(3);
    return MARKETING_CAMPAIGN_CODE_REGEX.test(campaignCode) ? campaignCode : null;
  }
}
