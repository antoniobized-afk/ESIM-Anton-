import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MarketingMiniAppCaptureIntent,
  MarketingTelegramCaptureStatus,
} from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  MARKETING_SOURCE_EVENT_KEY_REGEX,
  MarketingAttributionTransaction,
  VerifiedTelegramMiniAppLaunch,
} from './marketing-attribution.types';
import { MarketingAttributionTelegramService } from './marketing-attribution-telegram.service';

const MINI_APP_CAPTURE_RETRY_BATCH_SIZE = 20;
const MINI_APP_CAPTURE_LEASE_MS = 5 * 60 * 1000;
const MINI_APP_CAPTURE_MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const MINI_APP_CAPTURE_REJECTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type NormalizedMiniAppLaunch = {
  userId: string;
  telegramId: bigint;
  startParam?: string;
  sourceEventKey: string;
};

@Injectable()
export class MarketingAttributionMiniAppCaptureService {
  private readonly logger = new Logger(MarketingAttributionMiniAppCaptureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramAttribution: MarketingAttributionTelegramService,
  ) {}

  async enqueueVerifiedMiniAppLaunch(input: VerifiedTelegramMiniAppLaunch) {
    return this.prisma.$transaction((tx) =>
      this.enqueueVerifiedMiniAppLaunchInTransaction(tx, input),
    );
  }

  @Cron('*/30 * * * * *')
  async retryPendingMiniAppCaptures() {
    const now = new Date();
    const intents = await this.prisma.marketingMiniAppCaptureIntent.findMany({
      where: {
        status: {
          in: [
            MarketingTelegramCaptureStatus.PENDING,
            MarketingTelegramCaptureStatus.FAILED,
          ],
        },
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      orderBy: [
        { nextRetryAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: MINI_APP_CAPTURE_RETRY_BATCH_SIZE,
      select: { id: true },
    });

    for (const intent of intents) {
      try {
        await this.attemptIntent(intent.id);
      } catch (error) {
        this.logger.error(
          `Mini App marketing capture retry crashed for ${intent.id}: ${this.formatError(error)}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredMiniAppCaptureIntents() {
    const olderThan = new Date(Date.now() - MINI_APP_CAPTURE_REJECTED_RETENTION_MS);
    return this.prisma.marketingMiniAppCaptureIntent.deleteMany({
      where: {
        status: MarketingTelegramCaptureStatus.REJECTED,
        updatedAt: { lt: olderThan },
      },
    });
  }

  async enqueueVerifiedMiniAppLaunchInTransaction(
    tx: MarketingAttributionTransaction,
    input: VerifiedTelegramMiniAppLaunch,
  ) {
    const normalized = this.normalizeLaunch(input);
    await tx.marketingMiniAppCaptureIntent.createMany({
      data: normalized,
      skipDuplicates: true,
    });
    const persisted = await tx.marketingMiniAppCaptureIntent.findUnique({
      where: { sourceEventKey: normalized.sourceEventKey },
    });
    if (!persisted) {
      throw new ConflictException('Не удалось сохранить trusted Mini App launch');
    }

    this.assertSameLaunch(persisted, normalized);
    return persisted;
  }

  private async attemptIntent(intentId: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.marketingMiniAppCaptureIntent.updateMany({
      where: {
        id: intentId,
        status: {
          in: [
            MarketingTelegramCaptureStatus.PENDING,
            MarketingTelegramCaptureStatus.FAILED,
          ],
        },
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      data: {
        status: MarketingTelegramCaptureStatus.PENDING,
        attempts: { increment: 1 },
        lastAttemptAt: now,
        lastError: null,
        nextRetryAt: new Date(now.getTime() + MINI_APP_CAPTURE_LEASE_MS),
      },
    });
    if (claimed.count !== 1) {
      return;
    }

    const intent = await this.prisma.marketingMiniAppCaptureIntent.findUnique({
      where: { id: intentId },
    });
    if (!intent) {
      return;
    }

    try {
      await this.telegramAttribution.captureMiniAppTouch({
        userId: intent.userId,
        telegramId: intent.telegramId.toString(),
        startParam: intent.startParam ?? undefined,
        sourceEventKey: intent.sourceEventKey,
      });
      await this.prisma.marketingMiniAppCaptureIntent.deleteMany({
        where: { id: intent.id },
      });
    } catch (error) {
      const status = this.isTerminalCaptureError(error)
        ? MarketingTelegramCaptureStatus.REJECTED
        : MarketingTelegramCaptureStatus.FAILED;
      const message = this.formatError(error);

      await this.prisma.marketingMiniAppCaptureIntent.updateMany({
        where: { id: intent.id },
        data: {
          status,
          lastError: message,
          nextRetryAt:
            status === MarketingTelegramCaptureStatus.FAILED
              ? this.nextRetryAt(intent.attempts)
              : null,
        },
      });
      this.logger.warn(
        `Mini App marketing capture for ${intent.id} ${status.toLowerCase()}: ${message}`,
      );
    }
  }

  private normalizeLaunch(input: VerifiedTelegramMiniAppLaunch): NormalizedMiniAppLaunch {
    if (!input.userId || input.userId !== input.userId.trim()) {
      throw new BadRequestException('Mini App launch требует canonical userId');
    }
    if (!/^\d+$/.test(input.telegramId)) {
      throw new BadRequestException('Mini App launch содержит некорректный Telegram identity');
    }
    if (!MARKETING_SOURCE_EVENT_KEY_REGEX.test(input.sourceEventKey)) {
      throw new BadRequestException('Mini App launch содержит некорректный ключ идемпотентности');
    }
    if (input.startParam !== undefined && input.startParam.length > 64) {
      throw new BadRequestException('Mini App launch содержит слишком длинный start parameter');
    }

    return {
      userId: input.userId,
      telegramId: BigInt(input.telegramId),
      startParam: input.startParam,
      sourceEventKey: input.sourceEventKey,
    };
  }

  private assertSameLaunch(
    intent: Pick<
      MarketingMiniAppCaptureIntent,
      'userId' | 'telegramId' | 'startParam' | 'sourceEventKey'
    >,
    input: NormalizedMiniAppLaunch,
  ) {
    if (
      intent.userId !== input.userId ||
      intent.telegramId !== input.telegramId ||
      intent.startParam !== (input.startParam ?? null) ||
      intent.sourceEventKey !== input.sourceEventKey
    ) {
      throw new ConflictException(
        'Ключ Mini App launch уже принадлежит другому trusted marketing событию',
      );
    }
  }

  private isTerminalCaptureError(error: unknown) {
    return (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    );
  }

  private nextRetryAt(attempts: number) {
    const delayMs = Math.min(
      MINI_APP_CAPTURE_MAX_RETRY_DELAY_MS,
      60_000 * 2 ** Math.max(0, attempts - 1),
    );
    return new Date(Date.now() + delayMs);
  }

  private formatError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Mini App capture failed';
    return message.slice(0, 1000);
  }
}
