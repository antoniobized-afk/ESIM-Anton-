import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { TelegramNotificationService } from '../telegram/telegram-notification.service';
import {
  TransactionType,
  TransactionStatus,
  OrderStatus,
  Prisma,
  RepeatChargeAttemptStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { PushService } from '../notifications/push.service';
import { decryptCloudPaymentsToken } from './cloudpayments-token-crypto';
import type {
  ChargeOrderWithSavedCardResponse,
  SavedPaymentCardSummary,
  SavedCardChargeState,
} from '@shared/contracts/checkout';

type CloudPaymentsCardTokenRecord = {
  id: string;
  userId: string;
  accountId: string;
  cloudPaymentsToken: string;
  cardMask: string;
  cardBrand: string | null;
  expMonth: number | null;
  expYear: number | null;
  isActive: boolean;
  lastUsedAt: Date | null;
};

type CloudPaymentsTokenChargeApiResponse = {
  Success?: boolean;
  Message?: string | null;
  Model?: {
    TransactionId?: number | string | null;
    Amount?: number | string | null;
    Reason?: string | null;
    ReasonCode?: number | string | null;
    CardHolderMessage?: string | null;
  } | null;
  ReasonCode?: number | string | null;
};

type RepeatChargeAttemptRecord = {
  id: string;
  orderId: string;
  userId: string;
  savedCardId: string;
  status: RepeatChargeAttemptStatus;
  idempotencyKey: string;
  cloudPaymentsTransactionId: string | null;
  providerReasonCode: number | null;
  providerMessage: string | null;
  ambiguousReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly debugSensitiveLogs: boolean;
  private readonly cloudPaymentsPublicId: string;
  private readonly cloudPaymentsApiSecret: string;
  private readonly cloudPaymentsTokensChargeUrl =
    'https://api.cloudpayments.ru/payments/tokens/charge';
  private readonly repeatChargeInProgressMessage =
    'Платеж по привязанной карте уже обрабатывается. Не повторяйте оплату, дождитесь результата.';
  private readonly repeatChargeAmbiguousMessage =
    'Статус платежа по привязанной карте еще уточняется. Не запускайте повторную оплату и дождитесь проверки.';
  private readonly cloudPaymentsTokenEncryptionKeySource: string;
  
  // Robokassa credentials
  private readonly merchantLogin: string;
  private readonly password1: string;
  private readonly password2: string;
  private readonly isTest: boolean;
  private readonly robokassaUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private configService: ConfigService,
    private telegramNotification: TelegramNotificationService,
    private pushService: PushService,
  ) {
    this.cloudPaymentsPublicId = this.configService.get('CLOUDPAYMENTS_PUBLIC_ID') || '';
    this.cloudPaymentsApiSecret = this.configService.get('CLOUDPAYMENTS_API_SECRET') || '';
    this.cloudPaymentsTokenEncryptionKeySource =
      this.configService.get('CLOUDPAYMENTS_TOKEN_ENCRYPTION_KEY') || this.cloudPaymentsApiSecret;
    this.merchantLogin = this.configService.get('ROBOKASSA_MERCHANT_LOGIN') || '';
    this.password1 = this.configService.get('ROBOKASSA_PASSWORD1') || '';
    this.password2 = this.configService.get('ROBOKASSA_PASSWORD2') || '';
    this.isTest = this.configService.get('ROBOKASSA_TEST_MODE') === 'true';
    this.debugSensitiveLogs = this.configService.get('DEBUG_SENSITIVE_LOGS') === 'true';
    
    if (this.merchantLogin) {
      this.logger.log(`✅ Robokassa инициализирована (Merchant: ${this.merchantLogin}, Test: ${this.isTest})`);
    } else {
      this.logger.warn('⚠️ Robokassa не настроена - отсутствуют credentials');
    }
  }

  /**
   * Генерация MD5 подписи для Robokassa
   */
  private generateSignature(...parts: (string | number)[]): string {
    const str = parts.join(':');
    return crypto.createHash('md5').update(str).digest('hex');
  }

  private maskValue(value?: string | number | null, visibleEnd = 4): string {
    if (value === null || value === undefined) return 'n/a';
    const text = String(value);
    if (text.length <= visibleEnd) return text;
    return `***${text.slice(-visibleEnd)}`;
  }

  private logWebhookPayload(payload: any) {
    if (this.debugSensitiveLogs) {
      this.logger.debug(`Robokassa webhook payload: ${JSON.stringify(payload)}`);
      return;
    }

    this.logger.log(
      `📨 Robokassa webhook: InvId=${this.maskValue(payload?.InvId)} amount=${payload?.OutSum ?? 'n/a'} signature=${this.maskValue(payload?.SignatureValue)}`,
    );
  }

  private toSavedPaymentCardSummary(
    card: CloudPaymentsCardTokenRecord | null,
  ): SavedPaymentCardSummary | null {
    if (!card) return null;

    return {
      id: card.id,
      cardMask: card.cardMask,
      cardBrand: card.cardBrand,
      expMonth: card.expMonth,
      expYear: card.expYear,
      isActive: card.isActive,
      lastUsedAt: card.lastUsedAt,
    };
  }

  private async getActiveSavedCardRecord(userId: string) {
    return this.prisma.cloudPaymentsCardToken.findFirst({
      where: {
        userId,
        isActive: true,
      },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        userId: true,
        accountId: true,
        cloudPaymentsToken: true,
        cardMask: true,
        cardBrand: true,
        expMonth: true,
        expYear: true,
        isActive: true,
        lastUsedAt: true,
      },
    });
  }

  private async getRepeatChargeAttempt(orderId: string) {
    return this.prisma.repeatChargeAttempt.findUnique({
      where: { orderId },
      select: {
        id: true,
        orderId: true,
        userId: true,
        savedCardId: true,
        status: true,
        idempotencyKey: true,
        cloudPaymentsTransactionId: true,
        providerReasonCode: true,
        providerMessage: true,
        ambiguousReason: true,
        createdAt: true,
        updatedAt: true,
        finishedAt: true,
      },
    });
  }

  async getActiveSavedCard(userId: string): Promise<SavedPaymentCardSummary | null> {
    const card = await this.getActiveSavedCardRecord(userId);
    return this.toSavedPaymentCardSummary(card);
  }

  private ensureCloudPaymentsApiConfigured() {
    if (!this.cloudPaymentsPublicId || !this.cloudPaymentsApiSecret) {
      throw new BadRequestException('CloudPayments token API не настроен');
    }
  }

  private getRepeatChargeDescription(orderId: string) {
    return `Mojo mobile заказ #${orderId.slice(-8)}`;
  }

  private getDecryptedSavedCardToken(card: Pick<CloudPaymentsCardTokenRecord, 'cloudPaymentsToken'>) {
    if (!this.cloudPaymentsTokenEncryptionKeySource) {
      throw new BadRequestException('CloudPayments token encryption key не настроен');
    }

    return decryptCloudPaymentsToken(
      card.cloudPaymentsToken,
      this.cloudPaymentsTokenEncryptionKeySource,
    );
  }

  private getRepeatChargeReasonCode(payload?: CloudPaymentsTokenChargeApiResponse | null) {
    const raw = payload?.Model?.ReasonCode ?? payload?.ReasonCode ?? null;
    if (raw === null || raw === undefined || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getRepeatChargeMessage(payload?: CloudPaymentsTokenChargeApiResponse | null) {
    return (
      payload?.Model?.CardHolderMessage ||
      payload?.Message ||
      'Не удалось списать с привязанной карты'
    );
  }

  private isPermanentSavedCardFailure(reasonCode: number | null) {
    if (reasonCode === null) return false;

    return new Set([5033, 5036, 5041, 5043, 5054, 5062, 5063]).has(reasonCode);
  }

  private hasProviderDecision(payload?: CloudPaymentsTokenChargeApiResponse | null) {
    return Boolean(
      payload &&
        (
          typeof payload.Success === 'boolean' ||
          payload.Model?.ReasonCode !== undefined ||
          payload.ReasonCode !== undefined ||
          payload.Model?.CardHolderMessage ||
          payload.Message
        ),
    );
  }

  private buildRepeatChargeTransactionMetadata(params: {
    savedCardId: string;
    attemptId?: string;
    providerReasonCode?: number | null;
    providerMessage?: string | null;
    cloudPaymentsTransactionId?: string | null;
    ambiguousReason?: string | null;
  }) {
    return {
      purpose: 'esim_order',
      repeatCharge: true,
      savedCardId: params.savedCardId,
      repeatChargeAttemptId: params.attemptId ?? null,
      providerReasonCode: params.providerReasonCode ?? null,
      providerMessage: params.providerMessage ?? null,
      cloudPaymentsTransactionId: params.cloudPaymentsTransactionId ?? null,
      ambiguousReason: params.ambiguousReason ?? null,
    } as const;
  }

  private sanitizeCloudPaymentsMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!metadata) return null;

    return {
      source:
        typeof metadata.source === 'string'
          ? metadata.source
          : metadata.repeatCharge
            ? 'cloudpayments_repeat_charge'
            : 'cloudpayments',
      purpose: metadata.purpose ?? null,
      status: metadata.status ?? null,
      invoiceId: metadata.invoiceId ?? null,
      transactionId:
        metadata.cloudPaymentsTransactionId ?? metadata.transactionId ?? null,
      accountId: metadata.accountId ?? null,
      amount: metadata.amount ?? null,
      currency: metadata.currency ?? null,
      cardMask: metadata.cardMask ?? null,
      cardBrand: metadata.cardBrand ?? null,
      reasonCode: metadata.providerReasonCode ?? metadata.reasonCode ?? null,
      reason: metadata.providerMessage ?? metadata.reason ?? null,
      repeatCharge: metadata.repeatCharge ?? null,
      repeatChargeAttemptId: metadata.repeatChargeAttemptId ?? null,
      savedCardId: metadata.savedCardId ?? null,
      ambiguousReason: metadata.ambiguousReason ?? null,
      testMode: metadata.testMode ?? null,
      parentOrderId: metadata.parentOrderId ?? null,
    };
  }

  private sanitizeTransactionForApi<T extends {
    paymentProvider?: string | null;
    metadata?: Prisma.JsonValue | null;
  }>(transaction: T): T {
    if (transaction.paymentProvider !== 'cloudpayments') {
      return transaction;
    }

    return {
      ...transaction,
      metadata: this.sanitizeCloudPaymentsMetadata(
        transaction.metadata as Record<string, unknown> | null,
      ) as Prisma.JsonValue | null,
    };
  }

  private async buildExistingRepeatChargeResponse(
    orderId: string,
    savedCard: CloudPaymentsCardTokenRecord,
    attempt: RepeatChargeAttemptRecord,
  ) {
    const currentOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });

    if (attempt.status === RepeatChargeAttemptStatus.SUCCEEDED) {
      return {
        success: true,
        chargeState: 'succeeded' as SavedCardChargeState,
        fallbackToWidget: false,
        order: currentOrder as any,
        orderModel: currentOrder as any,
        savedCard: this.toSavedPaymentCardSummary(savedCard),
        repeatChargeAttemptId: attempt.id,
        message:
          currentOrder.status === OrderStatus.COMPLETED
            ? 'Оплата по привязанной карте прошла успешно'
            : 'Оплата уже прошла, заказ обрабатывается',
        reasonCode: attempt.providerReasonCode ?? 0,
      };
    }

    if (attempt.status === RepeatChargeAttemptStatus.DECLINED) {
      return {
        success: false,
        chargeState: 'declined' as SavedCardChargeState,
        fallbackToWidget: currentOrder.status === OrderStatus.CANCELLED,
        order: currentOrder as any,
        orderModel: currentOrder as any,
        savedCard: this.toSavedPaymentCardSummary(savedCard),
        repeatChargeAttemptId: attempt.id,
        message: attempt.providerMessage ?? 'Не удалось списать с привязанной карты',
        reasonCode: attempt.providerReasonCode,
      };
    }

    return {
      success: false,
      chargeState:
        attempt.status === RepeatChargeAttemptStatus.AMBIGUOUS
          ? ('ambiguous' as SavedCardChargeState)
          : ('in_progress' as SavedCardChargeState),
      fallbackToWidget: false,
      order: currentOrder as any,
      orderModel: currentOrder as any,
      savedCard: this.toSavedPaymentCardSummary(savedCard),
      repeatChargeAttemptId: attempt.id,
      message:
        attempt.status === RepeatChargeAttemptStatus.AMBIGUOUS
          ? this.repeatChargeAmbiguousMessage
          : this.repeatChargeInProgressMessage,
      reasonCode: attempt.providerReasonCode,
    };
  }

  private async claimRepeatChargeAttempt(
    userId: string,
    order: {
      id: string;
      totalAmount: Prisma.Decimal;
    },
    savedCard: CloudPaymentsCardTokenRecord,
  ): Promise<{
    created: boolean;
    paymentTxId: string;
    attempt: RepeatChargeAttemptRecord;
  }> {
    const selectAttempt = {
      id: true,
      orderId: true,
      userId: true,
      savedCardId: true,
      status: true,
      idempotencyKey: true,
      cloudPaymentsTransactionId: true,
      providerReasonCode: true,
      providerMessage: true,
      ambiguousReason: true,
      createdAt: true,
      updatedAt: true,
      finishedAt: true,
    } as const;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentOrder = await tx.order.findUnique({
          where: { id: order.id },
          include: {
            transactions: true,
          },
        });

        if (!currentOrder) {
          throw new BadRequestException('Заказ не найден');
        }
        if (currentOrder.userId !== userId) {
          throw new BadRequestException('Заказ принадлежит другому пользователю');
        }
        if (currentOrder.status !== OrderStatus.PENDING) {
          throw new BadRequestException('Заказ уже не находится в статусе PENDING');
        }

        const existingSucceededPayment = currentOrder.transactions.find(
          (txRecord) =>
            txRecord.type === TransactionType.PAYMENT &&
            txRecord.status === TransactionStatus.SUCCEEDED,
        );
        if (existingSucceededPayment) {
          throw new BadRequestException('Заказ уже оплачен');
        }

        const existingAttempt = await tx.repeatChargeAttempt.findUnique({
          where: { orderId: order.id },
          select: selectAttempt,
        });

        const existingPendingTx = currentOrder.transactions.find(
          (txRecord) =>
            txRecord.type === TransactionType.PAYMENT &&
            txRecord.status === TransactionStatus.PENDING &&
            txRecord.paymentProvider === 'cloudpayments',
        );

        if (existingAttempt) {
          if (!existingPendingTx && existingAttempt.status === RepeatChargeAttemptStatus.IN_PROGRESS) {
            throw new BadRequestException('Repeat charge attempt поврежден: pending transaction отсутствует');
          }

          return {
            created: false,
            paymentTxId: existingPendingTx?.id ?? '',
            attempt: existingAttempt,
          };
        }

        const paymentTx =
          existingPendingTx ||
          (await tx.transaction.create({
            data: {
              userId,
              orderId: order.id,
              type: TransactionType.PAYMENT,
              status: TransactionStatus.PENDING,
              amount: order.totalAmount,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'saved_card_token',
              metadata: this.buildRepeatChargeTransactionMetadata({
                savedCardId: savedCard.id,
              }) as any,
            },
          }));

        const attempt = await tx.repeatChargeAttempt.create({
          data: {
            orderId: order.id,
            userId,
            savedCardId: savedCard.id,
            status: RepeatChargeAttemptStatus.IN_PROGRESS,
            idempotencyKey: `repeat-charge-${order.id}`,
          },
          select: selectAttempt,
        });

        await tx.transaction.update({
          where: { id: paymentTx.id },
          data: {
            metadata: this.buildRepeatChargeTransactionMetadata({
              savedCardId: savedCard.id,
              attemptId: attempt.id,
            }) as any,
          },
        });

        return {
          created: true,
          paymentTxId: paymentTx.id,
          attempt,
        };
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') {
        throw error;
      }

      const [attempt, pendingTx] = await Promise.all([
        this.getRepeatChargeAttempt(order.id),
        this.prisma.transaction.findFirst({
          where: {
            orderId: order.id,
            type: TransactionType.PAYMENT,
            status: TransactionStatus.PENDING,
            paymentProvider: 'cloudpayments',
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      if (!attempt) {
        throw error;
      }

      return {
        created: false,
        paymentTxId: pendingTx?.id ?? '',
        attempt,
      };
    }
  }

  private async markRepeatChargeDeclined(params: {
    orderId: string;
    paymentTxId: string;
    attemptId: string;
    savedCardId: string;
    providerReasonCode: number | null;
    providerMessage: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: params.paymentTxId },
        data: {
          status: TransactionStatus.FAILED,
          metadata: this.buildRepeatChargeTransactionMetadata({
            savedCardId: params.savedCardId,
            attemptId: params.attemptId,
            providerReasonCode: params.providerReasonCode,
            providerMessage: params.providerMessage,
          }) as any,
        },
      });

      await tx.repeatChargeAttempt.update({
        where: { id: params.attemptId },
        data: {
          status: RepeatChargeAttemptStatus.DECLINED,
          providerReasonCode: params.providerReasonCode,
          providerMessage: params.providerMessage,
          finishedAt: new Date(),
        },
      });

      await this.ordersService.markOrderCancelled(
        params.orderId,
        {
          errorMessage: params.providerMessage,
        },
        'saved_card_fallback',
        tx,
      );
    });
  }

  private async markRepeatChargeAmbiguous(params: {
    paymentTxId: string;
    attemptId: string;
    savedCardId: string;
    providerReasonCode: number | null;
    providerMessage: string;
    ambiguousReason: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: params.paymentTxId },
        data: {
          metadata: this.buildRepeatChargeTransactionMetadata({
            savedCardId: params.savedCardId,
            attemptId: params.attemptId,
            providerReasonCode: params.providerReasonCode,
            providerMessage: params.providerMessage,
            ambiguousReason: params.ambiguousReason,
          }) as any,
        },
      });

      await tx.repeatChargeAttempt.update({
        where: { id: params.attemptId },
        data: {
          status: RepeatChargeAttemptStatus.AMBIGUOUS,
          providerReasonCode: params.providerReasonCode,
          providerMessage: params.providerMessage,
          ambiguousReason: params.ambiguousReason,
        },
      });
    });
  }

  private async cancelRepeatChargeOrder(
    orderId: string,
    reason: string,
    paymentStatus: TransactionStatus,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: {
          orderId,
          type: TransactionType.PAYMENT,
          status: TransactionStatus.PENDING,
        },
        data: {
          status: paymentStatus,
          metadata: {
            reason,
            ...metadata,
          } as any,
        },
      });

      await this.ordersService.markOrderCancelled(
        orderId,
        {
          errorMessage: reason,
        },
        'saved_card_fallback',
        tx,
      );
    });
  }

  async chargeOrderWithSavedCard(
    userId: string,
    orderId: string,
  ): Promise<
    ChargeOrderWithSavedCardResponse & {
      orderModel: {
        id: string;
        userId: string;
        productId: string;
        status: OrderStatus;
        quantity: number;
        periodNum: number | null;
        productPrice: Prisma.Decimal;
        discount: Prisma.Decimal;
        promoCode: string | null;
        promoDiscount: Prisma.Decimal;
        bonusUsed: Prisma.Decimal;
        totalAmount: Prisma.Decimal;
        parentOrderId: string | null;
        topupPackageCode: string | null;
        createdAt: Date;
        completedAt: Date | null;
      };
    }
  > {
    this.ensureCloudPaymentsApiConfigured();

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        transactions: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Заказ не найден');
    }
    if (order.userId !== userId) {
      throw new BadRequestException('Заказ принадлежит другому пользователю');
    }
    if (order.parentOrderId || order.topupPackageCode) {
      throw new BadRequestException('Repeat charge доступен только для purchase flow');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Заказ уже не находится в статусе PENDING');
    }
    if (Number(order.totalAmount) <= 0) {
      throw new BadRequestException('Repeat charge не применяется к бесплатным заказам');
    }

    const existingSucceededPayment = order.transactions.find(
      (tx) =>
        tx.type === TransactionType.PAYMENT &&
        tx.status === TransactionStatus.SUCCEEDED,
    );
    if (existingSucceededPayment) {
      throw new BadRequestException('Заказ уже оплачен');
    }

    const savedCard = await this.getActiveSavedCardRecord(userId);
    if (!savedCard) {
      const reason = 'Saved card unavailable';
      await this.cancelRepeatChargeOrder(order.id, reason, TransactionStatus.CANCELLED, {
        code: 'no_active_saved_card',
      });
      const cancelledOrder = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      return {
        success: false,
        chargeState: 'declined',
        fallbackToWidget: true,
        order: cancelledOrder as any,
        orderModel: cancelledOrder as any,
        savedCard: null,
        repeatChargeAttemptId: null,
        message: 'Привязанная карта недоступна. Откройте оплату новой картой.',
        reasonCode: null,
      };
    }

    if (savedCard.accountId !== userId) {
      this.logger.error(
        `Active saved card account mismatch: user=${userId} accountId=${savedCard.accountId}`,
      );
      throw new BadRequestException('Некорректная привязанная карта');
    }

    const claim = await this.claimRepeatChargeAttempt(userId, order, savedCard);
    if (!claim.created) {
      return this.buildExistingRepeatChargeResponse(order.id, savedCard, claim.attempt);
    }

    let providerPayload: CloudPaymentsTokenChargeApiResponse | null = null;

    try {
      const { data } = await axios.post<CloudPaymentsTokenChargeApiResponse>(
        this.cloudPaymentsTokensChargeUrl,
        {
          Amount: Number(order.totalAmount),
          Currency: 'RUB',
          AccountId: savedCard.accountId,
          Token: this.getDecryptedSavedCardToken(savedCard),
          InvoiceId: order.id,
          Description: this.getRepeatChargeDescription(order.id),
          Email: order.user.email || undefined,
          JsonData: {
            purpose: 'esim_order',
            repeatCharge: true,
            savedCardId: savedCard.id,
          },
        },
        {
          auth: {
            username: this.cloudPaymentsPublicId,
            password: this.cloudPaymentsApiSecret,
          },
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': claim.attempt.idempotencyKey,
          },
          timeout: 30000,
        },
      );

      providerPayload = data;
    } catch (error: any) {
      providerPayload = error?.response?.data ?? null;
      const reasonCode = this.getRepeatChargeReasonCode(providerPayload);
      const reason = this.getRepeatChargeMessage(providerPayload);
      const hasProviderDecision = this.hasProviderDecision(providerPayload);

      if (!hasProviderDecision) {
        const ambiguousReason = error?.code === 'ECONNABORTED' ? 'timeout' : 'transport_error';
        await this.markRepeatChargeAmbiguous({
          paymentTxId: claim.paymentTxId,
          attemptId: claim.attempt.id,
          savedCardId: savedCard.id,
          providerReasonCode: reasonCode,
          providerMessage: reason,
          ambiguousReason,
        });

        const pendingOrder = await this.prisma.order.findUniqueOrThrow({
          where: { id: order.id },
        });

        return {
          success: false,
          chargeState: 'ambiguous',
          fallbackToWidget: false,
          order: pendingOrder as any,
          orderModel: pendingOrder as any,
          savedCard: this.toSavedPaymentCardSummary(savedCard),
          repeatChargeAttemptId: claim.attempt.id,
          message: this.repeatChargeAmbiguousMessage,
          reasonCode,
        };
      }

      const shouldDeactivate = this.isPermanentSavedCardFailure(reasonCode);
      const providerMessage = `Saved card charge failed: ${reason}`;

      await this.markRepeatChargeDeclined({
        orderId: order.id,
        paymentTxId: claim.paymentTxId,
        attemptId: claim.attempt.id,
        savedCardId: savedCard.id,
        providerReasonCode: reasonCode,
        providerMessage,
      });

      if (shouldDeactivate) {
        await this.prisma.cloudPaymentsCardToken.update({
          where: { id: savedCard.id },
          data: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivationReason: `provider_reason_${reasonCode}`,
          },
        });
      }

      const cancelledOrder = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });

      return {
        success: false,
        chargeState: 'declined',
        fallbackToWidget: true,
        order: cancelledOrder as any,
        orderModel: cancelledOrder as any,
        savedCard: shouldDeactivate ? null : this.toSavedPaymentCardSummary(savedCard),
        repeatChargeAttemptId: claim.attempt.id,
        message: shouldDeactivate
          ? 'Привязанная карта больше недоступна. Откройте оплату новой картой.'
          : `${reason}. Откройте оплату новой картой.`,
        reasonCode,
      };
    }

    if (!providerPayload?.Success) {
      const reasonCode = this.getRepeatChargeReasonCode(providerPayload);
      const reason = this.getRepeatChargeMessage(providerPayload);
      const shouldDeactivate = this.isPermanentSavedCardFailure(reasonCode);
      const providerMessage = `Saved card charge failed: ${reason}`;

      await this.markRepeatChargeDeclined({
        orderId: order.id,
        paymentTxId: claim.paymentTxId,
        attemptId: claim.attempt.id,
        savedCardId: savedCard.id,
        providerReasonCode: reasonCode,
        providerMessage,
      });

      if (shouldDeactivate) {
        await this.prisma.cloudPaymentsCardToken.update({
          where: { id: savedCard.id },
          data: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivationReason: `provider_reason_${reasonCode}`,
          },
        });
      }

      const cancelledOrder = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });

      return {
        success: false,
        chargeState: 'declined',
        fallbackToWidget: true,
        order: cancelledOrder as any,
        orderModel: cancelledOrder as any,
        savedCard: shouldDeactivate ? null : this.toSavedPaymentCardSummary(savedCard),
        repeatChargeAttemptId: claim.attempt.id,
        message: shouldDeactivate
          ? 'Привязанная карта больше недоступна. Откройте оплату новой картой.'
          : `${reason}. Откройте оплату новой картой.`,
        reasonCode,
      };
    }

    const cpTransactionId = providerPayload?.Model?.TransactionId
      ? String(providerPayload.Model.TransactionId)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: claim.paymentTxId },
        data: {
          status: TransactionStatus.SUCCEEDED,
          paymentId: cpTransactionId,
          metadata: this.buildRepeatChargeTransactionMetadata({
            savedCardId: savedCard.id,
            attemptId: claim.attempt.id,
            providerReasonCode: 0,
            providerMessage: this.getRepeatChargeMessage(providerPayload),
            cloudPaymentsTransactionId: cpTransactionId,
          }) as any,
        },
      });

      await tx.repeatChargeAttempt.update({
        where: { id: claim.attempt.id },
        data: {
          status: RepeatChargeAttemptStatus.SUCCEEDED,
          cloudPaymentsTransactionId: cpTransactionId,
          providerReasonCode: 0,
          providerMessage: this.getRepeatChargeMessage(providerPayload),
          finishedAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
        },
      });

      await tx.cloudPaymentsCardToken.update({
        where: { id: savedCard.id },
        data: {
          lastUsedAt: new Date(),
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
        },
      });
    });

    let finalOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });

    try {
      await this.ordersService.fulfillOrder(order.id);
      finalOrder = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
    } catch (error: any) {
      this.logger.error(
        `Repeat charge payment captured but fulfill failed for order ${order.id}: ${error.message}`,
      );
      finalOrder = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
    }

    try {
      await this.pushService.sendPaymentSuccess(order.userId, {
        orderId: order.id,
        productName: order.product.name,
        country: order.product.country,
        dataAmount: order.product.dataAmount,
        price: Number(order.totalAmount),
      });
    } catch (error: any) {
      this.logger.error(`Push notification error: ${error.message}`);
    }

    return {
      success: true,
      chargeState: 'succeeded',
      fallbackToWidget: false,
      order: finalOrder as any,
      orderModel: finalOrder as any,
      savedCard: this.toSavedPaymentCardSummary({
        ...savedCard,
        lastUsedAt: new Date(),
      }),
      repeatChargeAttemptId: claim.attempt.id,
      message:
        finalOrder.status === OrderStatus.COMPLETED
          ? 'Оплата по привязанной карте прошла успешно'
          : 'Оплата прошла, заказ обрабатывается',
      reasonCode: 0,
    };
  }

  /**
   * Создать платеж через Robokassa
   */
  async createPayment(orderId: string) {
    const order = await this.ordersService.findById(orderId);

    if (!order) {
      throw new BadRequestException('Заказ не найден');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Заказ уже обработан');
    }

    // Создаем транзакцию
    const transaction = await this.prisma.transaction.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        type: TransactionType.PAYMENT,
        status: TransactionStatus.PENDING,
        amount: order.totalAmount,
        paymentProvider: 'robokassa',
      },
    });

    // Формируем данные для Robokassa
    const outSum = Number(order.totalAmount).toFixed(2);
    const invId = transaction.id.replace(/\D/g, '').slice(0, 15) || Date.now().toString(); // Только цифры, макс 15 символов
    const description = `Mojo mobile заказ #${order.id.slice(-8)}`;
    
    // Подпись: MerchantLogin:OutSum:InvId:Password1
    const signature = this.generateSignature(
      this.merchantLogin,
      outSum,
      invId,
      this.password1
    );

    // Формируем название товара для чека
    const productName = order.product 
      ? `${order.product.name} (${order.product.country}, ${order.product.dataAmount})`
      : 'Лицензионное вознаграждение за ПО Mojo mobile';
    
    // Формируем чек для фискализации (Робочеки)
    const receipt = {
      sno: 'usn_income', // Система налогообложения (УСН доход)
      items: [
        {
          name: productName,
          quantity: order.quantity || 1,
          sum: Number(outSum),
          tax: 'none', // Без НДС
          payment_method: 'full_prepayment', // Полная предоплата
          payment_object: 'service', // Услуга
        }
      ]
    };

    // Формируем URL для редиректа на Robokassa
    const params = new URLSearchParams({
      MerchantLogin: this.merchantLogin,
      OutSum: outSum,
      InvId: invId,
      Description: description,
      SignatureValue: signature,
      Culture: 'ru',
      Encoding: 'utf-8',
      Receipt: JSON.stringify(receipt), // Добавляем чек
    });

    if (this.isTest) {
      params.append('IsTest', '1');
    }

    const paymentUrl = `${this.robokassaUrl}?${params.toString()}`;

    // Обновляем транзакцию с данными платежа
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        paymentId: invId,
        metadata: {
          invId,
          outSum,
          paymentUrl,
          orderId: order.id,
        } as any,
      },
    });

    this.logger.log(
      `💳 Создан платеж Robokassa: InvId=${this.maskValue(invId)} Sum=${outSum}₽ Order=${this.maskValue(order.id, 6)} item=${receipt.items[0].name}`,
    );

    return {
      transaction,
      payment: {
        paymentId: invId,
        paymentUrl,
        amount: Number(outSum),
        currency: 'RUB',
      },
    };
  }

  async assertOrderOwnership(orderId: string, userId: string) {
    await this.ordersService.assertOwnership(orderId, userId);
  }

  /**
   * Создать платёж для пополнения личного баланса пользователя через Robokassa.
   *
   * В отличие от `createPayment` (который завязан на конкретный заказ-eSIM),
   * здесь Transaction создаётся БЕЗ orderId, а в metadata кладётся
   * `{ purpose: 'balance_topup', userId, amount }`. После успешного webhook
   * в `handleWebhook` мы атомарно увеличим `user.balance`, ничего не выдавая
   * через провайдера eSIM.
   */
  /**
   * Создать pending-Transaction под пополнение баланса через CloudPayments.
   *
   * Возвращает данные для виджета: `{ invoiceId, amount, publicId, accountId }`.
   * Виджет на клиенте откроется, проведёт оплату, а CloudPayments выстрелит
   * `check`/`pay` вебхуки в `CloudPaymentsService.handle*BalanceTopup`.
   *
   * Robokassa-флоу остаётся доступным через
   * `createBalanceTopupPaymentRobokassa` для совместимости.
   */
  async prepareCloudPaymentsBalanceTopup(userId: string, amount: number) {
    if (!Number.isFinite(amount) || amount < 100) {
      throw new BadRequestException('Минимальная сумма пополнения — 100 ₽');
    }
    if (amount > 100000) {
      throw new BadRequestException('Максимальная сумма пополнения — 100 000 ₽');
    }

    const publicId = process.env.CLOUDPAYMENTS_PUBLIC_ID;
    if (!publicId) {
      throw new BadRequestException('CloudPayments не настроен');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new BadRequestException('Пользователь не найден');

    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        orderId: null,
        type: TransactionType.PAYMENT,
        status: TransactionStatus.PENDING,
        amount: new Prisma.Decimal(amount),
        paymentProvider: 'cloudpayments',
        paymentMethod: 'balance_topup',
        metadata: { purpose: 'balance_topup', userId, amount } as any,
      },
    });

    return {
      provider: 'cloudpayments' as const,
      invoiceId: transaction.id,
      amount: Number(amount),
      currency: 'RUB',
      publicId,
      accountId: userId,
      description: `Пополнение баланса Mojo mobile #${transaction.id.slice(-6)}`,
      data: { purpose: 'balance_topup' as const, userId, amount: Number(amount) },
    };
  }

  /**
   * Старый Robokassa-флоу пополнения баланса.
   * Оставлен на случай, если CloudPayments по какой-то причине упадёт или
   * понадобится альтернативный провайдер (используется через `?provider=robokassa`).
   */
  async createBalanceTopupPayment(userId: string, amount: number) {
    if (!Number.isFinite(amount) || amount < 100) {
      throw new BadRequestException('Минимальная сумма пополнения — 100 ₽');
    }
    if (amount > 100000) {
      throw new BadRequestException('Максимальная сумма пополнения — 100 000 ₽');
    }
    if (!this.merchantLogin) {
      throw new BadRequestException('Платёжный шлюз не настроен');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('Пользователь не найден');

    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        orderId: null,
        type: TransactionType.PAYMENT,
        status: TransactionStatus.PENDING,
        amount: new Prisma.Decimal(amount),
        paymentProvider: 'robokassa',
        paymentMethod: 'balance_topup',
        metadata: { purpose: 'balance_topup', userId, amount } as any,
      },
    });

    const outSum = Number(amount).toFixed(2);
    const invId = transaction.id.replace(/\D/g, '').slice(0, 15) || Date.now().toString();
    const description = `Пополнение баланса Mojo mobile #${transaction.id.slice(-6)}`;

    const signature = this.generateSignature(
      this.merchantLogin,
      outSum,
      invId,
      this.password1,
    );

    const receipt = {
      sno: 'usn_income',
      items: [
        {
          name: description,
          quantity: 1,
          sum: Number(outSum),
          tax: 'none',
          payment_method: 'full_prepayment',
          payment_object: 'service',
        },
      ],
    };

    const params = new URLSearchParams({
      MerchantLogin: this.merchantLogin,
      OutSum: outSum,
      InvId: invId,
      Description: description,
      SignatureValue: signature,
      Culture: 'ru',
      Encoding: 'utf-8',
      Receipt: JSON.stringify(receipt),
    });
    if (this.isTest) params.append('IsTest', '1');

    const paymentUrl = `${this.robokassaUrl}?${params.toString()}`;

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        paymentId: invId,
        metadata: {
          purpose: 'balance_topup',
          userId,
          amount,
          invId,
          outSum,
          paymentUrl,
        } as any,
      },
    });

    this.logger.log(
      `💳 Создан balance-topup платёж: InvId=${this.maskValue(invId)} Sum=${outSum}₽ User=${this.maskValue(userId, 6)}`,
    );

    return {
      transaction,
      payment: {
        paymentId: invId,
        paymentUrl,
        amount: Number(outSum),
        currency: 'RUB',
      },
    };
  }

  /**
   * Найти заказ по InvId (для редиректа)
   */
  async findOrderByInvId(invId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { paymentId: invId },
      include: { order: true },
    });
    return transaction?.order;
  }

  /**
   * Обработка webhook (ResultURL) от Robokassa
   * Robokassa отправляет: OutSum, InvId, SignatureValue
   * Подпись проверяется: MD5(OutSum:InvId:Password2)
   */
  async handleWebhook(payload: any) {
    this.logWebhookPayload(payload);
    
    const { OutSum, InvId, SignatureValue } = payload;
    
    if (!OutSum || !InvId || !SignatureValue) {
      this.logger.error('❌ Неполные данные webhook');
      throw new BadRequestException('Missing required parameters');
    }

    // Проверяем подпись: MD5(OutSum:InvId:Password2)
    const expectedSignature = this.generateSignature(OutSum, InvId, this.password2);
    
    if (SignatureValue.toLowerCase() !== expectedSignature.toLowerCase()) {
      this.logger.error(
        `❌ Неверная подпись Robokassa: InvId=${this.maskValue(InvId)} expected=${this.maskValue(expectedSignature)} got=${this.maskValue(SignatureValue)}`,
      );
      throw new BadRequestException('Invalid signature');
    }

    this.logger.log(`✅ Подпись Robokassa верна для InvId=${this.maskValue(InvId)}`);

    // Находим транзакцию по InvId (paymentId)
    const transaction = await this.prisma.transaction.findFirst({
      where: { paymentId: InvId },
      include: { order: true },
    });

    if (!transaction) {
      this.logger.error(`❌ Транзакция не найдена: InvId=${this.maskValue(InvId)}`);
      throw new BadRequestException('Transaction not found');
    }

    // Проверяем сумму
    if (Number(OutSum).toFixed(2) !== Number(transaction.amount).toFixed(2)) {
      this.logger.error(`❌ Сумма не совпадает! Expected: ${transaction.amount}, Got: ${OutSum}`);
      throw new BadRequestException('Amount mismatch');
    }

    // Идемпотентность: если транзакция уже обработана (SUCCEEDED) — не делаем ничего повторно.
    // Robokassa может ретраить webhook, мы не должны дважды зачислить баланс или дважды выдать eSIM.
    if (transaction.status === TransactionStatus.SUCCEEDED) {
      this.logger.log(`ℹ️ Webhook повтор для InvId=${this.maskValue(InvId)}, транзакция уже обработана`);
      return `OK${InvId}`;
    }

    // === Ветка: пополнение личного баланса (без orderId) ===
    const meta = (transaction.metadata as any) || {};
    if (!transaction.orderId && meta.purpose === 'balance_topup') {
      const amount = Number(transaction.amount);
      try {
        await this.prisma.$transaction([
          this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: TransactionStatus.SUCCEEDED },
          }),
          this.prisma.user.update({
            where: { id: transaction.userId },
            data: { balance: { increment: new Prisma.Decimal(amount) } },
          }),
        ]);
        this.logger.log(
          `✅ Баланс пользователя ${this.maskValue(transaction.userId, 6)} пополнен на ${amount}₽ (InvId=${this.maskValue(InvId)})`,
        );

        // Уведомление в Telegram
        try {
          const u = await this.prisma.user.findUnique({
            where: { id: transaction.userId },
            select: { telegramId: true, balance: true },
          });
          if (u?.telegramId) {
            await this.telegramNotification.sendTextNotification(
              u.telegramId,
              `✅ <b>Баланс пополнен</b>\n\n` +
                `+${amount}₽\nТекущий баланс: <b>${Number(u.balance)}₽</b>`,
              { openMyEsim: false },
            );
          }
        } catch (e: any) {
          this.logger.warn(`Уведомление о пополнении баланса не отправлено: ${e.message}`);
        }
      } catch (error: any) {
        this.logger.error(`❌ Не удалось зачислить balance topup: ${error.message}`);
        throw new BadRequestException('Failed to credit balance');
      }
      return `OK${InvId}`;
    }

    const canReviveExpiredSession =
      transaction.order &&
      this.ordersService.isExpiredPaymentSessionOrder(transaction.order);
    const shouldProcessOrderPayment =
      transaction.order?.status === OrderStatus.PENDING || canReviveExpiredSession;

    if (!shouldProcessOrderPayment) {
      this.logger.warn(
        `Игнорируем Robokassa webhook для заказа ${this.maskValue(transaction.orderId, 6)} в статусе ${transaction.order?.status}`,
      );
      return `OK${InvId}`;
    }

    // Обновляем статус транзакции
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: TransactionStatus.SUCCEEDED },
    });

    // Обновляем статус заказа
    await this.ordersService.markOrderPaid(transaction.orderId);

    this.logger.log(
      `✅ Платеж подтверждён: InvId=${this.maskValue(InvId)} Order=${this.maskValue(transaction.orderId, 6)}`,
    );
    if (canReviveExpiredSession && transaction.order?.status !== OrderStatus.PENDING) {
      this.logger.warn(
        `Поздний Robokassa webhook восстановил протухшую payment session для ${this.maskValue(transaction.orderId, 6)}`,
      );
    }

    // Выдаем eSIM
    try {
      await this.ordersService.fulfillOrder(transaction.orderId);
      this.logger.log(`✅ eSIM выдан для заказа ${this.maskValue(transaction.orderId, 6)}`);
    } catch (error) {
      this.logger.error(`❌ Ошибка выдачи eSIM: ${error.message}`);
    }

    // Отправляем уведомление в Telegram
    try {
      const fullOrder = await this.ordersService.findById(transaction.orderId);
      if (fullOrder && fullOrder.user) {
        await this.telegramNotification.sendPaymentSuccessNotification(
          fullOrder.user.telegramId,
          {
            orderId: fullOrder.id,
            productName: fullOrder.product.name,
            country: fullOrder.product.country,
            dataAmount: fullOrder.product.dataAmount,
            price: Number(fullOrder.totalAmount),
          }
        );
        this.logger.log(`✅ Уведомление отправлено в Telegram для ${fullOrder.user.telegramId}`);
      }
    } catch (error) {
      this.logger.error(`❌ Ошибка отправки уведомления: ${error.message}`);
    }

    // Robokassa ожидает ответ "OK" + InvId
    return `OK${InvId}`;
  }

  /**
   * Получить транзакции пользователя
   */
  async findByUser(userId: string, limit = 50) {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        order: {
          include: {
            product: true,
          },
        },
      },
    });

    return transactions.map((transaction) => this.sanitizeTransactionForApi(transaction));
  }

  /**
   * Получить все транзакции (для админки)
   */
  async findAll(filters?: {
    status?: TransactionStatus;
    type?: TransactionType;
    page?: number;
    limit?: number;
  }) {
    const { status, type, page = 1, limit = 20 } = filters || {};
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              telegramId: true,
              username: true,
            },
          },
          order: {
            include: {
              product: true,
            },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions.map((transaction) => this.sanitizeTransactionForApi(transaction)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
