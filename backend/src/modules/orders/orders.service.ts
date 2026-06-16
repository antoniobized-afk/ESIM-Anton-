import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { EsimProviderService } from '../esim-provider/esim-provider.service';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { TelegramNotificationService } from '../telegram/telegram-notification.service';
import { EmailService } from '../notifications/email.service';
import { PushService } from '../notifications/push.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { EsimStatus } from '../esim-provider/esim-status';
import { LoyaltyService } from '../loyalty/loyalty.service';
import {
  OrderCompletionAccountingService,
  type CompletionAccountingAttemptResult,
} from './order-completion-accounting.service';
import {
  CompletionAccountingStatus,
  OrderStatus,
  Prisma,
  PromoCodeRedemptionSource,
  PromoCodeSource,
  RepeatChargeAttemptStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

/**
 * Сколько секунд жить кэшу usage по умолчанию.
 * Активная eSIM меняет показания не каждый момент — 5 минут это разумный
 * компромисс между отзывчивостью UI и нагрузкой на eSIM Access API.
 */
const DEFAULT_USAGE_CACHE_SEC = 300;
/**
 * Если кэш старше N секунд — даже при ошибке провайдера не показываем его
 * (могут быть сильно устаревшие данные → introduce in error).
 */
const STALE_CACHE_LIMIT_SEC = 24 * 60 * 60;
const BONUS_HOLD_TTL_MS = 30 * 60 * 1000;
const PAYMENT_SESSION_EXPIRED_MESSAGE = 'Payment session expired';

type BonusSpendAvailability = {
  totalEligible: number;
  cashbackEligible: number;
  referralEligible: number;
  trackedReferral: number;
  trackedCashback: number;
  legacyUntracked: number;
};

type BonusSpendBreakdown = {
  bonusToUse: number;
  spentFromCashback: number;
  spentFromReferral: number;
};

type ResolvedLoyaltyLevel = {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discount: number;
} | null;

type OrderPricingSnapshot = {
  user: {
    id: string;
    balance: Prisma.Decimal | number;
    bonusBalance: Prisma.Decimal | number;
    totalSpent: Prisma.Decimal | number;
    referralLinkId?: string | null;
    referredById?: string | null;
  };
  product: {
    id: string;
    ourPrice: Prisma.Decimal | number;
    providerPrice: Prisma.Decimal | number;
    isActive: boolean;
    isUnlimited: boolean;
  };
  quantity: number;
  days: number;
  promoId: string | null;
  promoCode: string | null;
  promoCodeSource: PromoCodeSource | null;
  promoStatus: 'applied' | 'none' | 'unavailable';
  promoMessage: string | null;
  hasReferralAttribution: boolean;
  baseAmount: number;
  promoDiscount: number;
  loyaltyDiscount: number;
  bonusUsed: number;
  totalAmount: number;
  currentLoyaltyLevel: ResolvedLoyaltyLevel;
  bonusSpend: BonusSpendBreakdown;
};

type ReconciliationCategory =
  | 'pending_paid_recovery'
  | 'webhook_acked_fulfillment_pending'
  | 'stuck_processing'
  | 'completion_accounting_failed'
  | 'provider_failed_after_card_charge'
  | 'provider_failed_balance_refunded'
  | 'topup_failed_balance_refunded'
  | 'repeat_charge_ambiguous'
  | 'issued_but_finalize_failed'
  | 'topup_issued_but_finalize_failed';

type ReconciliationSnapshot = {
  needsAttention: boolean;
  category: ReconciliationCategory | null;
  refunded: boolean;
  paymentProvider: string | null;
  paymentMethod: string | null;
  paymentAmount: number | null;
  lastError: string | null;
  repeatChargeAttemptId: string | null;
  repeatChargeAttemptStatus: RepeatChargeAttemptStatus | null;
  providerReasonCode: number | null;
  providerMessage: string | null;
  ambiguousReason: string | null;
};

type PurchaseFulfillmentNotificationOrder = {
  id: string;
  userId: string;
  totalAmount: Prisma.Decimal | number;
  qrCode?: string | null;
  iccid?: string | null;
  activationCode?: string | null;
  smdpAddress?: string | null;
  product?: {
    name?: string | null;
    country?: string | null;
    dataAmount?: string | null;
  } | null;
  user?: {
    telegramId?: bigint | number | string | null;
    email?: string | null;
  } | null;
};

export class FulfillmentFinalizeException extends Error {
  readonly kind = 'fulfillment_finalize_failed';

  constructor(
    message: string,
    readonly orderId: string,
    readonly stage: 'purchase' | 'topup',
  ) {
    super(message);
    this.name = 'FulfillmentFinalizeException';
  }
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
    private usersService: UsersService,
    private esimProviderService: EsimProviderService,
    private promoCodesService: PromoCodesService,
    private telegramNotification: TelegramNotificationService,
    private emailService: EmailService,
    private pushService: PushService,
    private systemSettingsService: SystemSettingsService,
    private loyaltyService: LoyaltyService,
    private completionAccountingService: OrderCompletionAccountingService,
  ) {}

  private metadataNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private deriveReconciliationSnapshot(order: {
    status: OrderStatus;
    parentOrderId?: string | null;
    errorMessage?: string | null;
    providerOrderId?: string | null;
    providerResponse?: Prisma.JsonValue | null;
    iccid?: string | null;
    qrCode?: string | null;
    activationCode?: string | null;
    completionAccountingStatus?: CompletionAccountingStatus | null;
    completionAccountingLastError?: string | null;
    transactions?: Array<{
      type: TransactionType;
      status: TransactionStatus;
      amount: Prisma.Decimal | number;
      paymentProvider?: string | null;
      paymentMethod?: string | null;
      metadata?: Prisma.JsonValue | null;
    }>;
    repeatChargeAttempt?: {
      id: string;
      status: RepeatChargeAttemptStatus;
      providerReasonCode?: number | null;
      providerMessage?: string | null;
      ambiguousReason?: string | null;
    } | null;
  }): ReconciliationSnapshot {
    const paymentTx = order.transactions?.find(
      (tx) => tx.type === TransactionType.PAYMENT && tx.status === TransactionStatus.SUCCEEDED,
    );
    const refundTx = order.transactions?.find(
      (tx) => tx.type === TransactionType.REFUND && tx.status === TransactionStatus.SUCCEEDED,
    );
    const repeatChargeAttempt = order.repeatChargeAttempt ?? null;

    if (repeatChargeAttempt?.status === RepeatChargeAttemptStatus.AMBIGUOUS) {
      const repeatChargeTx = order.transactions?.find(
        (tx) =>
          tx.type === TransactionType.PAYMENT &&
          tx.paymentProvider === 'cloudpayments' &&
          tx.paymentMethod === 'saved_card_token',
      );

      return {
        needsAttention: true,
        category: 'repeat_charge_ambiguous',
        refunded: false,
        paymentProvider: repeatChargeTx?.paymentProvider ?? 'cloudpayments',
        paymentMethod: repeatChargeTx?.paymentMethod ?? 'saved_card_token',
        paymentAmount: repeatChargeTx ? Number(repeatChargeTx.amount) : null,
        lastError: repeatChargeAttempt.providerMessage ?? order.errorMessage ?? null,
        repeatChargeAttemptId: repeatChargeAttempt.id,
        repeatChargeAttemptStatus: repeatChargeAttempt.status,
        providerReasonCode: repeatChargeAttempt.providerReasonCode ?? null,
        providerMessage: repeatChargeAttempt.providerMessage ?? null,
        ambiguousReason: repeatChargeAttempt.ambiguousReason ?? null,
      };
    }

    if (
      order.status === OrderStatus.COMPLETED &&
      order.completionAccountingStatus === CompletionAccountingStatus.FAILED
    ) {
      return {
        needsAttention: true,
        category: 'completion_accounting_failed',
        refunded: false,
        paymentProvider: paymentTx?.paymentProvider ?? null,
        paymentMethod: paymentTx?.paymentMethod ?? null,
        paymentAmount: paymentTx ? Number(paymentTx.amount) : null,
        lastError: order.completionAccountingLastError ?? order.errorMessage ?? null,
        repeatChargeAttemptId: repeatChargeAttempt?.id ?? null,
        repeatChargeAttemptStatus: repeatChargeAttempt?.status ?? null,
        providerReasonCode: repeatChargeAttempt?.providerReasonCode ?? null,
        providerMessage: repeatChargeAttempt?.providerMessage ?? null,
        ambiguousReason: repeatChargeAttempt?.ambiguousReason ?? null,
      };
    }

    const providerIssuedLocallyUnfinalized =
      order.status === OrderStatus.PROCESSING &&
      Boolean(
        order.providerOrderId ||
          order.providerResponse ||
          order.iccid ||
          order.qrCode ||
          order.activationCode,
      );

    if (providerIssuedLocallyUnfinalized && paymentTx) {
      return {
        needsAttention: true,
        category: order.parentOrderId
          ? 'topup_issued_but_finalize_failed'
          : 'issued_but_finalize_failed',
        refunded: false,
        paymentProvider: paymentTx.paymentProvider ?? null,
        paymentMethod: paymentTx.paymentMethod ?? null,
        paymentAmount: Number(paymentTx.amount),
        lastError: order.errorMessage ?? null,
        repeatChargeAttemptId: repeatChargeAttempt?.id ?? null,
        repeatChargeAttemptStatus: repeatChargeAttempt?.status ?? null,
        providerReasonCode: repeatChargeAttempt?.providerReasonCode ?? null,
        providerMessage: repeatChargeAttempt?.providerMessage ?? null,
        ambiguousReason: repeatChargeAttempt?.ambiguousReason ?? null,
      };
    }

    if (order.status === OrderStatus.PAID && paymentTx) {
      return {
        needsAttention: true,
        category: 'webhook_acked_fulfillment_pending',
        refunded: false,
        paymentProvider: paymentTx.paymentProvider ?? null,
        paymentMethod: paymentTx.paymentMethod ?? null,
        paymentAmount: Number(paymentTx.amount),
        lastError: order.errorMessage ?? null,
        repeatChargeAttemptId: repeatChargeAttempt?.id ?? null,
        repeatChargeAttemptStatus: repeatChargeAttempt?.status ?? null,
        providerReasonCode: repeatChargeAttempt?.providerReasonCode ?? null,
        providerMessage: repeatChargeAttempt?.providerMessage ?? null,
        ambiguousReason: repeatChargeAttempt?.ambiguousReason ?? null,
      };
    }

    if (order.status === OrderStatus.PENDING && paymentTx) {
      return {
        needsAttention: true,
        category: 'pending_paid_recovery',
        refunded: false,
        paymentProvider: paymentTx.paymentProvider ?? null,
        paymentMethod: paymentTx.paymentMethod ?? null,
        paymentAmount: Number(paymentTx.amount),
        lastError: order.errorMessage ?? null,
        repeatChargeAttemptId: repeatChargeAttempt?.id ?? null,
        repeatChargeAttemptStatus: repeatChargeAttempt?.status ?? null,
        providerReasonCode: repeatChargeAttempt?.providerReasonCode ?? null,
        providerMessage: repeatChargeAttempt?.providerMessage ?? null,
        ambiguousReason: repeatChargeAttempt?.ambiguousReason ?? null,
      };
    }

    if (order.status === OrderStatus.PROCESSING && paymentTx) {
      return {
        needsAttention: true,
        category: 'stuck_processing',
        refunded: false,
        paymentProvider: paymentTx.paymentProvider ?? null,
        paymentMethod: paymentTx.paymentMethod ?? null,
        paymentAmount: Number(paymentTx.amount),
        lastError: order.errorMessage ?? null,
        repeatChargeAttemptId: repeatChargeAttempt?.id ?? null,
        repeatChargeAttemptStatus: repeatChargeAttempt?.status ?? null,
        providerReasonCode: repeatChargeAttempt?.providerReasonCode ?? null,
        providerMessage: repeatChargeAttempt?.providerMessage ?? null,
        ambiguousReason: repeatChargeAttempt?.ambiguousReason ?? null,
      };
    }

    if (order.status !== OrderStatus.FAILED || !paymentTx) {
      return {
        needsAttention: false,
        category: null,
        refunded: false,
        paymentProvider: paymentTx?.paymentProvider ?? null,
        paymentMethod: paymentTx?.paymentMethod ?? null,
        paymentAmount: paymentTx ? Number(paymentTx.amount) : null,
        lastError: order.errorMessage ?? null,
        repeatChargeAttemptId: repeatChargeAttempt?.id ?? null,
        repeatChargeAttemptStatus: repeatChargeAttempt?.status ?? null,
        providerReasonCode: repeatChargeAttempt?.providerReasonCode ?? null,
        providerMessage: repeatChargeAttempt?.providerMessage ?? null,
        ambiguousReason: repeatChargeAttempt?.ambiguousReason ?? null,
      };
    }

    const isBalancePayment =
      paymentTx.paymentMethod === 'balance' || paymentTx.paymentProvider === 'balance';
    const isTopup = Boolean(order.parentOrderId);
    let category: ReconciliationCategory;

    if (isBalancePayment && isTopup && refundTx) {
      category = 'topup_failed_balance_refunded';
    } else if (isBalancePayment && refundTx) {
      category = 'provider_failed_balance_refunded';
    } else {
      category = 'provider_failed_after_card_charge';
    }

    return {
      needsAttention: true,
      category,
      refunded: Boolean(refundTx),
      paymentProvider: paymentTx.paymentProvider ?? null,
      paymentMethod: paymentTx.paymentMethod ?? null,
      paymentAmount: Number(paymentTx.amount),
      lastError: order.errorMessage ?? null,
      repeatChargeAttemptId: repeatChargeAttempt?.id ?? null,
      repeatChargeAttemptStatus: repeatChargeAttempt?.status ?? null,
      providerReasonCode: repeatChargeAttempt?.providerReasonCode ?? null,
      providerMessage: repeatChargeAttempt?.providerMessage ?? null,
      ambiguousReason: repeatChargeAttempt?.ambiguousReason ?? null,
    };
  }

  private decorateOrderWithReconciliation<T extends {
    status: OrderStatus;
    parentOrderId?: string | null;
    errorMessage?: string | null;
    providerOrderId?: string | null;
    providerResponse?: Prisma.JsonValue | null;
    iccid?: string | null;
    qrCode?: string | null;
    activationCode?: string | null;
    transactions?: Array<{
      type: TransactionType;
      status: TransactionStatus;
      amount: Prisma.Decimal | number;
      paymentProvider?: string | null;
      paymentMethod?: string | null;
      metadata?: Prisma.JsonValue | null;
    }>;
    repeatChargeAttempt?: {
      id: string;
      status: RepeatChargeAttemptStatus;
      providerReasonCode?: number | null;
      providerMessage?: string | null;
      ambiguousReason?: string | null;
    } | null;
  }>(order: T) {
    return {
      ...order,
      reconciliation: this.deriveReconciliationSnapshot(order),
    };
  }

  private logReconciliationSignal(
    order: {
      id: string;
      status: OrderStatus;
      parentOrderId?: string | null;
      errorMessage?: string | null;
      transactions?: Array<{
        type: TransactionType;
        status: TransactionStatus;
        amount: Prisma.Decimal | number;
        paymentProvider?: string | null;
        paymentMethod?: string | null;
        metadata?: Prisma.JsonValue | null;
      }>;
      repeatChargeAttempt?: {
        id: string;
        status: RepeatChargeAttemptStatus;
        providerReasonCode?: number | null;
        providerMessage?: string | null;
        ambiguousReason?: string | null;
      } | null;
    },
    stage: 'purchase' | 'topup',
  ) {
    const reconciliation = this.deriveReconciliationSnapshot(order);
    if (!reconciliation.needsAttention) return;

    this.logger.error(
      `Reconciliation required: ${JSON.stringify({
        orderId: order.id,
        stage,
        category: reconciliation.category,
        refunded: reconciliation.refunded,
        paymentProvider: reconciliation.paymentProvider,
        paymentMethod: reconciliation.paymentMethod,
        paymentAmount: reconciliation.paymentAmount,
        error: reconciliation.lastError,
        repeatChargeAttemptId: reconciliation.repeatChargeAttemptId,
        repeatChargeAttemptStatus: reconciliation.repeatChargeAttemptStatus,
        providerReasonCode: reconciliation.providerReasonCode,
        providerMessage: reconciliation.providerMessage,
        ambiguousReason: reconciliation.ambiguousReason,
      })}`,
    );
  }

  private async getEffectiveLoyaltyLevel(totalSpent: number): Promise<ResolvedLoyaltyLevel> {
    return this.loyaltyService.getEffectiveLevelForSpent(totalSpent);
  }

  private isFulfillmentFinalizeError(error: unknown): error is FulfillmentFinalizeException {
    return error instanceof FulfillmentFinalizeException;
  }

  private buildIssuedEsimSnapshot(esimData: {
    qr_code?: string | null;
    iccid?: string | null;
    activation_code?: string | null;
    order_id?: string | null;
    smdp_address?: string | null;
  }): Prisma.OrderUpdateInput {
    return {
      qrCode: esimData.qr_code ?? null,
      iccid: esimData.iccid ?? null,
      activationCode: esimData.activation_code ?? null,
      providerOrderId: esimData.order_id ?? null,
      providerResponse: esimData as any,
      ...(esimData.smdp_address ? { smdpAddress: esimData.smdp_address } : {}),
    };
  }

  private async persistProviderIssuedButFinalizeFailed(
    orderId: string,
    stage: 'purchase' | 'topup',
    data: Prisma.OrderUpdateInput,
    cause: unknown,
  ) {
    const message = cause instanceof Error ? cause.message : 'Локальная финализация заказа не удалась';
    const persisted = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.PROCESSING,
        errorMessage: `Provider issuance succeeded, local finalize failed: ${message}`,
        ...data,
      },
      include: {
        product: true,
        user: {
          include: {
            loyaltyLevel: true,
            referredBy: true,
          },
        },
        transactions: true,
        repeatChargeAttempt: true,
      },
    });

    this.logReconciliationSignal(persisted, stage);

    throw new FulfillmentFinalizeException(message, orderId, stage);
  }

  private async sendPurchaseFulfillmentNotifications(
    order: PurchaseFulfillmentNotificationOrder,
  ) {
    if (!order.product) {
      this.logger.warn(`Purchase notifications skipped for ${order.id}: product snapshot is missing`);
      return;
    }

    const country = order.product.country ?? order.product.name ?? 'eSIM';
    const dataAmount = order.product.dataAmount ?? 'eSIM';
    const esimDetails = {
      country,
      dataAmount,
      iccid: order.iccid ?? undefined,
      qrCode: order.qrCode ?? undefined,
      activationCode: order.activationCode ?? undefined,
      smdpAddress: order.smdpAddress ?? undefined,
      orderId: order.id,
    };

    if (order.user?.telegramId) {
      try {
        await this.telegramNotification.sendEsimDetails(order.user.telegramId, esimDetails);
      } catch (e: any) {
        this.logger.error(`TG notification failed: ${e.message}`);
      }
    }

    if (order.user?.email) {
      try {
        await this.emailService.sendEsimReady(order.user.email, {
          orderId: order.id,
          country,
          dataAmount,
          iccid: order.iccid ?? undefined,
          qrCode: order.qrCode ?? undefined,
          activationCode: order.activationCode ?? undefined,
          price: Number(order.totalAmount),
        });
        this.logger.log(`✅ Email с eSIM отправлен на ${order.user.email}`);
      } catch (e: any) {
        this.logger.error(`Email notification failed: ${e.message}`);
      }
    }

    try {
      await this.pushService.sendPaymentSuccess(order.userId, {
        orderId: order.id,
        productName: order.product.name ?? country,
        country,
        dataAmount,
        price: Number(order.totalAmount),
      });
    } catch (e: any) {
      this.logger.error(`Push notification error: ${e.message}`);
    }
  }

  private async sendTopupCompletionNotification(order: {
    id: string;
    userId: string;
    user?: { telegramId?: bigint | number | string | null } | null;
  }) {
    let telegramId = order.user?.telegramId ?? null;
    if (!telegramId) {
      const user = await this.prisma.user.findUnique({
        where: { id: order.userId },
        select: { telegramId: true },
      });
      telegramId = user?.telegramId ?? null;
    }

    if (!telegramId) return;

    try {
      await this.telegramNotification.sendTextNotification(
        telegramId,
        '✅ <b>Пополнение eSIM выполнено</b>\n\n' +
          'Свежий объём трафика уже доступен. ' +
          'Откройте приложение, чтобы посмотреть остаток.',
        { openMyEsim: true },
      );
    } catch (e: any) {
      this.logger.warn(`Топ-ап уведомление не отправилось: ${e.message}`);
    }
  }

  private isNonBlockingAutoPromoError(error: unknown) {
    return (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    );
  }

  private getAutoPromoUnavailableMessage(error: unknown) {
    const rawMessage =
      error instanceof Error && error.message
        ? error.message
        : 'Промокод недоступен';

    switch (rawMessage) {
      case 'Срок действия промокода истёк':
        return 'Срок действия промокода по партнёрской ссылке истёк. Покупка продолжится без этой скидки.';
      case 'Промокод деактивирован':
        return 'Промокод по партнёрской ссылке деактивирован. Покупка продолжится без этой скидки.';
      case 'Промокод исчерпан':
        return 'Промокод по партнёрской ссылке исчерпан. Покупка продолжится без этой скидки.';
      case 'Промокод не найден':
        return 'Промокод по партнёрской ссылке больше не найден. Покупка продолжится без этой скидки.';
      case 'Промокод уже использован':
        return 'Промокод по партнёрской ссылке можно применить только один раз. Покупка продолжится без этой скидки.';
      default:
        return 'Промокод по партнёрской ссылке сейчас недоступен. Покупка продолжится без этой скидки.';
    }
  }

  private getReferralLinkUnavailableMessage(reason: 'inactive' | 'expired' | 'missing') {
    switch (reason) {
      case 'inactive':
        return 'Партнёрская ссылка больше не активна. Покупка продолжится без реферальной скидки.';
      case 'expired':
        return 'Срок действия партнёрской ссылки истёк. Покупка продолжится без реферальной скидки.';
      case 'missing':
      default:
        return 'Партнёрская ссылка больше недоступна. Покупка продолжится без реферальной скидки.';
    }
  }

  private async buildOrderPricingSnapshot(
    userId: string,
    productId: string,
    opts?: {
      quantity?: number;
      useBonuses?: number;
      periodNum?: number;
      promoCode?: string;
    },
  ): Promise<OrderPricingSnapshot> {
    const quantity = opts?.quantity ?? 1;
    const useBonuses = opts?.useBonuses ?? 0;

    const [user, product] = await Promise.all([
      this.usersService.findById(userId),
      this.productsService.findById(productId),
    ]);

    if (!product.isActive) {
      throw new BadRequestException('Продукт недоступен');
    }

    const days = product.isUnlimited && opts?.periodNum ? opts.periodNum : 1;
    const baseAmount = Number(product.ourPrice) * quantity * days;
    let totalAmount = baseAmount;
    let promoDiscount = 0;
    let loyaltyDiscount = 0;
    let promoId: string | null = null;
    let promoCode: string | null = null;
    let promoCodeSource: PromoCodeSource | null = null;
    let promoStatus: OrderPricingSnapshot['promoStatus'] = 'none';
    let promoMessage: string | null = null;
    const normalizedManualPromoCode = opts?.promoCode?.trim().toUpperCase() || null;
    const hasReferralAttribution = Boolean(
      user.referredById || user.referralLinkId,
    );

    if (normalizedManualPromoCode) {
      const promoPreview = await this.promoCodesService.validateForReservation(
        normalizedManualPromoCode,
        user.id,
      );
      if (promoPreview.partnerRewardPolicy?.ownerId === user.id) {
        throw new BadRequestException(
          'Нельзя применить собственный партнёрский промокод',
        );
      }
      promoId = promoPreview.promoId;
      promoCode = promoPreview.code;
      promoCodeSource = PromoCodeSource.MANUAL;
      promoStatus = 'applied';
      const discountPercent = Number(promoPreview.discountPercent);
      promoDiscount = (totalAmount * discountPercent) / 100;
      totalAmount -= promoDiscount;
    } else if (user.referralLinkId) {
      const referralLink = await this.prisma.referralLink.findUnique({
        where: { id: user.referralLinkId },
        include: {
          promoCode: {
            select: {
              code: true,
            },
          },
        },
      });

      if (!referralLink) {
        promoStatus = 'unavailable';
        promoMessage = this.getReferralLinkUnavailableMessage('missing');
      } else if (!referralLink.isActive) {
        promoStatus = 'unavailable';
        promoMessage = this.getReferralLinkUnavailableMessage('inactive');
      } else if (referralLink.expiresAt && referralLink.expiresAt <= new Date()) {
        promoStatus = 'unavailable';
        promoMessage = this.getReferralLinkUnavailableMessage('expired');
      } else if (referralLink.promoCode?.code) {
        try {
          const promoPreview = await this.promoCodesService.validateForReservation(
            referralLink.promoCode.code,
            user.id,
          );
          promoId = promoPreview.promoId;
          promoCode = promoPreview.code;
          promoCodeSource = PromoCodeSource.REFERRAL_LINK_AUTO;
          promoStatus = 'applied';
          const discountPercent = Number(promoPreview.discountPercent);
          promoDiscount = (totalAmount * discountPercent) / 100;
          totalAmount -= promoDiscount;
        } catch (error: any) {
          if (!this.isNonBlockingAutoPromoError(error)) {
            throw error;
          }

          promoStatus = 'unavailable';
          promoMessage = this.getAutoPromoUnavailableMessage(error);
        }
      }
    }

    const currentLoyaltyLevel = await this.getEffectiveLoyaltyLevel(
      Number(user.totalSpent),
    );

    if (currentLoyaltyLevel) {
      loyaltyDiscount =
        (totalAmount * Number(currentLoyaltyLevel.discount)) / 100;
      totalAmount -= loyaltyDiscount;
    }

    const bonusSpend = await this.computeBonusSpend(
      userId,
      Number(user.bonusBalance),
      useBonuses,
      totalAmount,
    );
    totalAmount -= bonusSpend.bonusToUse;

    if (totalAmount < 0) totalAmount = 0;

    return {
      user,
      product,
      quantity,
      days,
      promoId,
      promoCode,
      promoCodeSource,
      promoStatus,
      promoMessage,
      hasReferralAttribution,
      baseAmount,
      promoDiscount,
      loyaltyDiscount,
      bonusUsed: bonusSpend.bonusToUse,
      totalAmount: Math.round(totalAmount * 100) / 100,
      currentLoyaltyLevel,
      bonusSpend,
    };
  }

  private async cleanupExpiredBonusSpendHolds(userId?: string) {
    await this.cleanupExpiredPendingPaymentSessions(userId);

    const cutoff = new Date(Date.now() - BONUS_HOLD_TTL_MS);
    const pendingHolds = await this.prisma.transaction.findMany({
      where: {
        ...(userId ? { userId } : {}),
        type: TransactionType.BONUS_SPENT,
        status: TransactionStatus.PENDING,
      },
      select: {
        id: true,
        orderId: true,
        order: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    const staleHolds = pendingHolds.filter((hold) => {
      if (!hold.order) return true;
      if (hold.order.status !== OrderStatus.PENDING) return true;
      return hold.order.createdAt < cutoff;
    });

    if (staleHolds.length === 0) return;

    const staleHoldIds = staleHolds.map((hold) => hold.id);
    const staleOrderIds = staleHolds
      .map((hold) => hold.orderId)
      .filter((orderId): orderId is string => Boolean(orderId));

    await this.prisma.transaction.updateMany({
      where: { id: { in: staleHoldIds } },
      data: {
        status: TransactionStatus.CANCELLED,
        metadata: {
          releaseReason: 'payment_session_expired',
        } as any,
      },
    });

    await Promise.all(
      staleOrderIds.map((orderId) => this.expirePendingPaymentSession(orderId)),
    );
  }

  isExpiredPaymentSessionOrder(order: {
    status: OrderStatus;
    createdAt: Date;
    errorMessage?: string | null;
  }): boolean {
    if (order.status === OrderStatus.CANCELLED) {
      return order.errorMessage === PAYMENT_SESSION_EXPIRED_MESSAGE;
    }

    if (order.status !== OrderStatus.PENDING) return false;
    return order.createdAt < new Date(Date.now() - BONUS_HOLD_TTL_MS);
  }

  async expirePendingPaymentSession(orderId: string) {
    await this.prisma.transaction.updateMany({
      where: {
        orderId,
        type: TransactionType.PAYMENT,
        status: TransactionStatus.PENDING,
      },
      data: {
        status: TransactionStatus.CANCELLED,
        metadata: {
          releaseReason: 'payment_session_expired',
        } as any,
      },
    });

    await this.markOrderCancelled(
      orderId,
      {
        errorMessage: PAYMENT_SESSION_EXPIRED_MESSAGE,
      },
      'payment_session_expired',
    );
  }

  private async cleanupExpiredPendingPaymentSessions(userId?: string) {
    const cutoff = new Date(Date.now() - BONUS_HOLD_TTL_MS);
    const staleOrders = await this.prisma.order.findMany({
      where: {
        ...(userId ? { userId } : {}),
        status: OrderStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    if (staleOrders.length === 0) return;

    await Promise.all(
      staleOrders.map((order) => this.expirePendingPaymentSession(order.id)),
    );
  }

  private async getBonusSpendAvailability(
    userId: string,
    currentBonusBalance: number,
  ): Promise<BonusSpendAvailability> {
    await this.cleanupExpiredBonusSpendHolds(userId);

    const [settings, transactions] = await Promise.all([
      this.systemSettingsService.getReferralSettings(),
      this.prisma.transaction.findMany({
        where: {
          userId,
          type: {
            in: [
              TransactionType.REFERRAL_BONUS,
              TransactionType.BONUS_ACCRUAL,
              TransactionType.BONUS_SPENT,
            ],
          },
          status: {
            in: [TransactionStatus.SUCCEEDED, TransactionStatus.PENDING],
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          type: true,
          status: true,
          amount: true,
          metadata: true,
        },
      }),
    ]);

    let referralCredits = 0;
    let cashbackCredits = 0;
    let spentReferral = 0;
    let spentCashback = 0;

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const metadata = tx.metadata as Record<string, unknown> | null;

      if (
        tx.type === TransactionType.REFERRAL_BONUS &&
        tx.status === TransactionStatus.SUCCEEDED
      ) {
        referralCredits += amount;
        continue;
      }

      if (
        tx.type === TransactionType.BONUS_ACCRUAL &&
        tx.status === TransactionStatus.SUCCEEDED
      ) {
        const restoredToReferral = this.metadataNumber(metadata?.restoredToReferral);
        const restoredToCashback = this.metadataNumber(metadata?.restoredToCashback);

        if (restoredToReferral > 0 || restoredToCashback > 0) {
          referralCredits += restoredToReferral;
          cashbackCredits += restoredToCashback;
        } else {
          cashbackCredits += amount;
        }
        continue;
      }

      if (tx.type === TransactionType.BONUS_SPENT) {
        spentReferral += this.metadataNumber(metadata?.spentFromReferral);
        spentCashback += this.metadataNumber(metadata?.spentFromCashback);
      }
    }

    const trackedReferral = Math.max(0, referralCredits - spentReferral);
    const trackedCashback = Math.max(0, cashbackCredits - spentCashback);
    const legacyUntracked = Math.max(
      0,
      currentBonusBalance - trackedReferral - trackedCashback,
    );
    const cashbackEligible = trackedCashback + legacyUntracked;
    const referralEligible =
      trackedReferral >= Number(settings.minPayout) ? trackedReferral : 0;

    return {
      totalEligible: cashbackEligible + referralEligible,
      cashbackEligible,
      referralEligible,
      trackedReferral,
      trackedCashback,
      legacyUntracked,
    };
  }

  private async computeBonusSpend(
    userId: string,
    currentBonusBalance: number,
    requestedBonuses: number,
    totalAmount: number,
  ): Promise<BonusSpendBreakdown> {
    const availability = await this.getBonusSpendAvailability(userId, currentBonusBalance);
    const bonusToUse = Math.min(
      Math.max(0, requestedBonuses),
      currentBonusBalance,
      totalAmount,
      availability.totalEligible,
    );
    const spentFromCashback = Math.min(bonusToUse, availability.cashbackEligible);
    const spentFromReferral = Math.min(
      availability.referralEligible,
      Math.max(0, bonusToUse - spentFromCashback),
    );

    return {
      bonusToUse,
      spentFromCashback,
      spentFromReferral,
    };
  }

  private async createBonusSpendHold(
    userId: string,
    orderId: string,
    bonusSpend: BonusSpendBreakdown,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (bonusSpend.bonusToUse <= 0) return;

    await client.transaction.create({
      data: {
        userId,
        orderId,
        type: TransactionType.BONUS_SPENT,
        status: TransactionStatus.PENDING,
        amount: new Prisma.Decimal(bonusSpend.bonusToUse),
        metadata: {
          source: 'order_bonus_hold',
          spentFromReferral: bonusSpend.spentFromReferral,
          spentFromCashback: bonusSpend.spentFromCashback,
        },
      },
    });
  }

  async finalizeBonusSpendHold(orderId: string) {
    const hold = await this.prisma.transaction.findFirst({
      where: {
        orderId,
        type: TransactionType.BONUS_SPENT,
        status: TransactionStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!hold) return;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: hold.userId },
        data: {
          bonusBalance: { decrement: hold.amount },
        },
      }),
      this.prisma.transaction.update({
        where: { id: hold.id },
        data: {
          status: TransactionStatus.SUCCEEDED,
          metadata: {
            ...((hold.metadata as Record<string, unknown> | null) ?? {}),
            source: 'order_bonus_spend',
          } as any,
        },
      }),
    ]);
  }

  async releaseBonusSpendHold(orderId: string, reason = 'payment_failed') {
    await this.prisma.transaction.updateMany({
      where: {
        orderId,
        type: TransactionType.BONUS_SPENT,
        status: TransactionStatus.PENDING,
      },
      data: {
        status: TransactionStatus.CANCELLED,
        metadata: {
          releaseReason: reason,
        } as any,
      },
    });
  }

  private async releaseBonusSpendHoldWithClient(
    client: Prisma.TransactionClient | PrismaService,
    orderId: string,
    reason = 'payment_failed',
  ) {
    await client.transaction.updateMany({
      where: {
        orderId,
        type: TransactionType.BONUS_SPENT,
        status: TransactionStatus.PENDING,
      },
      data: {
        status: TransactionStatus.CANCELLED,
        metadata: {
          releaseReason: reason,
        } as any,
      },
    });
  }

  private async restoreBonusSpend(orderId: string, reason: string) {
    const spentTx = await this.prisma.transaction.findFirst({
      where: {
        orderId,
        type: TransactionType.BONUS_SPENT,
        status: TransactionStatus.SUCCEEDED,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!spentTx) return;

    const metadata = (spentTx.metadata as Record<string, unknown> | null) ?? {};
    const restoredToReferral = this.metadataNumber(metadata.spentFromReferral);
    const restoredToCashback = this.metadataNumber(metadata.spentFromCashback);
    const alreadyRestored = await this.prisma.transaction.findFirst({
      where: {
        orderId,
        type: TransactionType.BONUS_ACCRUAL,
        status: TransactionStatus.SUCCEEDED,
        metadata: {
          path: ['source'],
          equals: 'order_bonus_refund',
        },
      },
    });

    if (alreadyRestored) return;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: spentTx.userId },
        data: {
          bonusBalance: { increment: spentTx.amount },
        },
      }),
      this.prisma.transaction.create({
        data: {
          userId: spentTx.userId,
          orderId,
          type: TransactionType.BONUS_ACCRUAL,
          status: TransactionStatus.SUCCEEDED,
          amount: spentTx.amount,
          metadata: {
            source: 'order_bonus_refund',
            reason,
            restoredToReferral,
            restoredToCashback,
          } as any,
        },
      }),
    ]);
  }

  async markOrderPaid(
    orderId: string,
    data?: Partial<Prisma.OrderUpdateInput>,
    client?: Prisma.TransactionClient | PrismaService,
  ) {
    return this.updateStatus(orderId, OrderStatus.PAID, data, client ?? this.prisma);
  }

  async markOrderCompleted(
    orderId: string,
    data?: Partial<Prisma.OrderUpdateInput>,
    client?: Prisma.TransactionClient | PrismaService,
  ) {
    const run = async (tx: Prisma.TransactionClient | PrismaService) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          promoCode: true,
        },
      });

      if (!order) {
        throw new BadRequestException('Заказ не найден');
      }

      const updated = await this.updateStatus(orderId, OrderStatus.COMPLETED, data, tx);

      if (order.promoCode) {
        await this.promoCodesService.consumeReservation(order.id, tx);
      }

      return updated;
    };

    if (client) {
      return run(client);
    }

    return this.prisma.$transaction((tx) => run(tx));
  }

  async markOrderFailed(
    orderId: string,
    data?: Partial<Prisma.OrderUpdateInput>,
    reason = 'payment_failed',
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await this.releaseBonusSpendHoldWithClient(client, orderId, reason);
    await this.promoCodesService.releaseReservation(orderId, client);
    return this.updateStatus(orderId, OrderStatus.FAILED, data, client);
  }

  async markOrderCancelled(
    orderId: string,
    data?: Partial<Prisma.OrderUpdateInput>,
    reason = 'cancelled',
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await this.releaseBonusSpendHoldWithClient(client, orderId, reason);
    await this.promoCodesService.releaseReservation(orderId, client);
    return this.updateStatus(orderId, OrderStatus.CANCELLED, data, client);
  }

  private isBalancePaidOrder(order: any) {
    return order.transactions?.some(
      (tx: any) =>
        tx.type === TransactionType.PAYMENT &&
        tx.status === TransactionStatus.SUCCEEDED &&
        (tx.paymentProvider === 'balance' || tx.paymentMethod === 'balance'),
    );
  }

  /**
   * Гарантирует, что заказ существует и принадлежит пользователю.
   * Бросает 404 если не найден, 403 если чужой.
   */
  async assertOwnership(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true },
    });
    if (!order) throw new BadRequestException('Заказ не найден');
    if (order.userId !== userId) {
      throw new ForbiddenException('Заказ принадлежит другому пользователю');
    }
    return order;
  }

  /**
   * Создать заказ
   */
  async create(
    userId: string,
    productId: string,
    quantity = 1,
    useBonuses = 0,
    periodNum?: number,
    promoCodeStr?: string,
  ) {
    await this.cleanupExpiredBonusSpendHolds(userId);
    const pricing = await this.buildOrderPricingSnapshot(userId, productId, {
      quantity,
      useBonuses,
      periodNum,
      promoCode: promoCodeStr,
    });

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          productId,
          quantity: pricing.quantity,
          ...(pricing.product.isUnlimited && pricing.days > 1
            ? { periodNum: pricing.days }
            : {}),
          productPrice: pricing.product.ourPrice,
          discount: new Prisma.Decimal(pricing.loyaltyDiscount),
          promoCode: pricing.promoCode,
          promoCodeSource: pricing.promoCodeSource,
          promoDiscount: new Prisma.Decimal(pricing.promoDiscount),
          bonusUsed: new Prisma.Decimal(pricing.bonusUsed),
          totalAmount: new Prisma.Decimal(pricing.totalAmount),
          status: OrderStatus.PENDING,
        },
        include: {
          product: true,
          user: true,
        },
      });

      await this.createBonusSpendHold(userId, order.id, pricing.bonusSpend, tx);

      if (pricing.promoCode && pricing.promoCodeSource) {
        await this.promoCodesService.reserveForOrder(
          pricing.promoCode,
          userId,
          order.id,
          pricing.promoCodeSource === PromoCodeSource.MANUAL
            ? PromoCodeRedemptionSource.MANUAL
            : PromoCodeRedemptionSource.REFERRAL_LINK_AUTO,
          tx,
        );
      }

      return order;
    });
  }

  async previewPricing(
    userId: string,
    productId: string,
    opts?: {
      quantity?: number;
      useBonuses?: number;
      periodNum?: number;
      promoCode?: string;
    },
  ) {
    await this.cleanupExpiredBonusSpendHolds(userId);

    const pricing = await this.buildOrderPricingSnapshot(userId, productId, {
      ...opts,
    });

    return {
      productId,
      quantity: pricing.quantity,
      periodNum: pricing.product.isUnlimited && pricing.days > 1 ? pricing.days : null,
      baseAmount: pricing.baseAmount,
      promoCode: pricing.promoCode,
      promoCodeSource: pricing.promoCodeSource,
      promoStatus: pricing.promoStatus,
      promoMessage: pricing.promoMessage,
      hasReferralAttribution: pricing.hasReferralAttribution,
      promoDiscount: pricing.promoDiscount,
      loyaltyDiscount: pricing.loyaltyDiscount,
      bonusUsed: pricing.bonusUsed,
      totalAmount: pricing.totalAmount,
      isFree: pricing.totalAmount <= 0,
      currentLoyaltyLevel: pricing.currentLoyaltyLevel,
      balanceSufficient: Number(pricing.user.balance) >= pricing.totalAmount,
    };
  }

  /**
   * Получить заказ по ID
   */
  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        product: true,
        user: {
          include: {
            loyaltyLevel: true,
            referredBy: true,
          },
        },
        transactions: true,
        repeatChargeAttempt: true,
      },
    });

    return order ? this.decorateOrderWithReconciliation(order) : order;
  }

  async retryFulfillment(orderId: string) {
    const order = await this.findById(orderId);

    if (!order) {
      throw new BadRequestException('Заказ не найден');
    }

    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Повторный запуск fulfillment доступен только для оплаченного заказа');
    }

    return this.fulfillOrder(orderId);
  }

  async recoverPendingPaidOrder(orderId: string) {
    const order = await this.findById(orderId);

    if (!order) {
      throw new BadRequestException('Заказ не найден');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Recovery оплаты доступен только для pending-заказа');
    }

    const paymentTx = order.transactions?.find(
      (tx) => tx.type === TransactionType.PAYMENT && tx.status === TransactionStatus.SUCCEEDED,
    );

    if (!paymentTx) {
      throw new BadRequestException(
        'Нельзя запустить recovery без локально зафиксированной успешной payment transaction',
      );
    }

    const claimed = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: OrderStatus.PENDING,
      },
      data: {
        status: OrderStatus.PAID,
        errorMessage: null,
      },
    });

    if (claimed.count !== 1) {
      const freshOrder = await this.findById(orderId);
      if (!freshOrder) {
        throw new BadRequestException('Заказ не найден');
      }
      if (freshOrder.status === OrderStatus.PAID) {
        return this.fulfillOrder(orderId);
      }
      if (
        freshOrder.status === OrderStatus.PROCESSING ||
        freshOrder.status === OrderStatus.COMPLETED
      ) {
        return freshOrder;
      }

      throw new BadRequestException('Не удалось перевести заказ в paid для recovery');
    }

    return this.fulfillOrder(orderId);
  }

  async finalizeReconciledOrder(orderId: string) {
    const order = await this.findById(orderId);

    if (!order) {
      throw new BadRequestException('Заказ не найден');
    }

    if (order.status !== OrderStatus.PROCESSING) {
      throw new BadRequestException('Ручная финализация доступна только для заказа в processing');
    }

    const category = this.deriveReconciliationSnapshot(order).category;
    if (
      category !== 'issued_but_finalize_failed' &&
      category !== 'topup_issued_but_finalize_failed'
    ) {
      throw new BadRequestException(
        'Ручная финализация доступна только для заказа с уже выданным provider snapshot',
      );
    }

    if (order.parentOrderId) {
      const completedOrder = await this.prisma.$transaction(async (tx) => {
        const completedOrder = await this.markOrderCompleted(
          order.id,
          {
            providerOrderId: order.providerOrderId ?? undefined,
            providerResponse: order.providerResponse ?? undefined,
            completionAccountingStatus: CompletionAccountingStatus.NOT_REQUIRED,
            completionAccountingNextRetryAt: null,
            completionAccountingLastError: null,
            errorMessage: null,
          },
          tx,
        );

        await tx.order.update({
          where: { id: order.parentOrderId! },
          data: {
            lastUsageAt: null,
            lastUsageTotalBytes: null,
            lowTrafficNotifiedAt: null,
          },
        });

        return completedOrder;
      });

      await this.sendTopupCompletionNotification(order);
      return completedOrder;
    }

    const completedOrder = await this.prisma.$transaction(async (tx) => {
      return this.markOrderCompleted(
        order.id,
        {
          qrCode: order.qrCode ?? undefined,
          iccid: order.iccid ?? undefined,
          activationCode: order.activationCode ?? undefined,
          providerOrderId: order.providerOrderId ?? undefined,
          providerResponse: order.providerResponse ?? undefined,
          smdpAddress: order.smdpAddress ?? undefined,
          completionAccountingStatus: CompletionAccountingStatus.PENDING,
          completionAccountingNextRetryAt: null,
          completionAccountingLastError: null,
          errorMessage: null,
        },
        tx,
      );
    });

    await this.sendPurchaseFulfillmentNotifications(order);
    const accountingResult = await this.runPurchaseCompletionAccounting(orderId);
    return this.withCompletionAccountingResult(completedOrder, accountingResult);
  }

  async finalizeProviderIssuedProcessingOrder(orderId: string) {
    const order = await this.findById(orderId);

    if (!order) {
      return {
        finalized: false,
        orderStatus: null,
        category: null,
        reason: 'order_not_found',
      };
    }

    const reconciliation = this.deriveReconciliationSnapshot(order);
    if (order.status !== OrderStatus.PROCESSING) {
      return {
        finalized: false,
        orderStatus: order.status,
        category: reconciliation.category,
        reason: 'not_processing',
      };
    }

    if (
      reconciliation.category !== 'issued_but_finalize_failed' &&
      reconciliation.category !== 'topup_issued_but_finalize_failed'
    ) {
      return {
        finalized: false,
        orderStatus: order.status,
        category: reconciliation.category,
        reason: 'not_provider_issued_snapshot',
      };
    }

    const completedOrder = await this.finalizeReconciledOrder(orderId);
    return {
      finalized: completedOrder?.status === OrderStatus.COMPLETED,
      orderStatus: completedOrder?.status ?? null,
      category: reconciliation.category,
      reason: 'provider_issued_snapshot_finalized',
    };
  }

  async retryCompletionAccounting(orderId: string) {
    return this.completionAccountingService.retryPurchaseAccounting(orderId);
  }

  private withCompletionAccountingResult<
    T extends {
      completionAccountingStatus?: CompletionAccountingStatus | null;
      completionAccountingLastError?: string | null;
    },
  >(order: T, result: CompletionAccountingAttemptResult | null): T {
    if (!result) return order;

    return {
      ...order,
      completionAccountingStatus: result.status,
      completionAccountingLastError: result.error ?? null,
    };
  }

  private async runPurchaseCompletionAccounting(
    orderId: string,
  ): Promise<CompletionAccountingAttemptResult | null> {
    try {
      return await this.completionAccountingService.attemptPurchaseAccounting(orderId, { force: true });
    } catch (error: any) {
      this.logger.error(
        `Completion accounting trigger failed for order ${orderId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Получить заказы пользователя
   */
  async findByUser(userId: string, limit = 50) {
    await this.cleanupExpiredBonusSpendHolds(userId);

    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        product: true,
        transactions: true,
        repeatChargeAttempt: true,
      },
    });

    return orders.map((order) => this.decorateOrderWithReconciliation(order));
  }

  /**
   * Проверить новые оплаченные заказы (за последние 10 минут)
   */
  async checkNewOrders(userId: string) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const newOrders = await this.prisma.order.findMany({
      where: {
        userId,
        status: {
          in: [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.COMPLETED],
        },
        createdAt: {
          gte: tenMinutesAgo,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: {
        product: true,
      },
    });

    return {
      hasNewOrders: newOrders.length > 0,
      latestOrder: newOrders[0] || null,
    };
  }

  /**
   * Обновить статус заказа
   */
  private async updateStatus(
    orderId: string,
    status: OrderStatus,
    data?: Partial<Prisma.OrderUpdateInput>,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === OrderStatus.COMPLETED && { completedAt: new Date() }),
        ...data,
      },
    });
  }

  private async claimOrderForFulfillment(orderId: string) {
    const claimed = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: OrderStatus.PAID,
      },
      data: {
        status: OrderStatus.PROCESSING,
      },
    });

    if (claimed.count === 1) {
      return true;
    }

    const freshOrder = await this.findById(orderId);
    if (!freshOrder) {
      throw new BadRequestException('Заказ не найден');
    }

    if (freshOrder.status === OrderStatus.COMPLETED) {
      return false;
    }

    if (freshOrder.status === OrderStatus.PROCESSING) {
      throw new ConflictException('Заказ уже обрабатывается');
    }

    throw new BadRequestException('Заказ еще не оплачен');
  }

  /**
   * Выдать eSIM (вызывается после успешной оплаты).
   *
   * Если у заказа выставлены `parentOrderId` и `topupPackageCode` — это пополнение
   * существующей eSIM, тогда вместо покупки нового профиля делаем top-up
   * к ICCID родительского заказа.
   */
  async fulfillOrder(orderId: string) {
    const claimed = await this.claimOrderForFulfillment(orderId);
    if (!claimed) {
      return this.findById(orderId);
    }

    const order = await this.findById(orderId);
    if (!order) {
      throw new BadRequestException('Заказ не найден');
    }

    await this.finalizeBonusSpendHold(orderId);

    // === Top-up flow ===
    if (order.parentOrderId && order.topupPackageCode) {
      return this.fulfillTopupOrder(order as any);
    }

    try {
      const esimData = await this.esimProviderService.purchaseEsim(
        order.product.providerId,
        order.user.email,
        order.periodNum ?? undefined,
        Number(order.product.providerPrice) || undefined,
        order.id,
      );
      const issuedEsimSnapshot = this.buildIssuedEsimSnapshot(esimData);

      let updatedOrder;
      try {
        updatedOrder = await this.prisma.$transaction(async (tx) => {
          return this.markOrderCompleted(
            orderId,
            {
              ...issuedEsimSnapshot,
              completionAccountingStatus: CompletionAccountingStatus.PENDING,
              completionAccountingNextRetryAt: null,
              completionAccountingLastError: null,
            },
            tx,
          );
        });
      } catch (error: any) {
        await this.persistProviderIssuedButFinalizeFailed(
          orderId,
          'purchase',
          issuedEsimSnapshot,
          error,
        );
      }

      await this.sendPurchaseFulfillmentNotifications({
        ...order,
        qrCode: esimData.qr_code ?? null,
        iccid: esimData.iccid ?? null,
        activationCode: esimData.activation_code ?? null,
        smdpAddress: esimData.smdp_address ?? null,
      });
      const accountingResult = await this.runPurchaseCompletionAccounting(orderId);
      return this.withCompletionAccountingResult(updatedOrder, accountingResult);
    } catch (error: any) {
      if (this.isFulfillmentFinalizeError(error)) {
        throw error;
      }

      if (!this.isBalancePaidOrder(order)) {
        try {
          await this.restoreBonusSpend(orderId, error.message);
        } catch (restoreError: any) {
          this.logger.error(
            `Bonus rollback failed for order ${order.id}: ${restoreError.message}`,
          );
        }
      }

      // В случае ошибки помечаем заказ как FAILED
      await this.markOrderFailed(orderId, {
        errorMessage: error.message,
      });

      this.logReconciliationSignal(
        {
          id: order.id,
          status: OrderStatus.FAILED,
          parentOrderId: order.parentOrderId,
          errorMessage: error.message,
          transactions: order.transactions,
        },
        'purchase',
      );

      throw error;
    }
  }

  /**
   * Получить usage (расход трафика) и snapshot статуса по заказу.
   *
   * Возвращает не только расход, но и нормализованный статус eSIM, даты
   * активации/истечения, SMDP — всё, что нужно для карточки в /my-esim.
   *
   * Поведение:
   *  - если eSIM ещё не выдана (нет ICCID) → available:false с причиной;
   *  - если в БД есть свежий кэш (lastUsageAt < maxAgeSec назад) — отдаём его сразу
   *    (включая закэшированные esimStatus/expiresAt/activatedAt/smdpAddress);
   *  - иначе запрашиваем snapshot у провайдера, обновляем кэш атомарно;
   *  - при ошибке провайдера, если есть НЕ устаревший (< STALE_CACHE_LIMIT_SEC) кэш —
   *    отдаём его с пометкой `stale=true`, иначе available:false.
   */
  async getOrderUsage(
    orderId: string,
    maxAgeSec = DEFAULT_USAGE_CACHE_SEC,
    force = false,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true },
    });

    if (!order) {
      throw new BadRequestException('Заказ не найден');
    }

    if (!order.iccid) {
      return this.buildUnavailableResponse(order, 'eSIM ещё не выдана');
    }

    const now = Date.now();
    const cachedAt = order.lastUsageAt?.getTime() ?? null;
    const cachedFresh =
      !force && cachedAt !== null && now - cachedAt < maxAgeSec * 1000;

    let usedBytes: number | null =
      order.lastUsageBytes !== null && order.lastUsageBytes !== undefined
        ? Number(order.lastUsageBytes)
        : null;
    let totalBytes: number | null =
      order.lastUsageTotalBytes !== null && order.lastUsageTotalBytes !== undefined
        ? Number(order.lastUsageTotalBytes)
        : null;
    let updatedAt: Date | null = order.lastUsageAt;
    let stale = false;

    // Метаданные снапшота — стартуем с того, что в кэше
    let esimStatus: string | null = order.esimStatus ?? null;
    let activatedAt: Date | null = order.activatedAt ?? null;
    let expiresAt: Date | null = order.expiresAt ?? null;
    let smdpAddress: string | null = order.smdpAddress ?? null;
    let activationCode: string | null = order.activationCode ?? null;

    if (cachedFresh) {
      return this.buildUsageResponse(order, {
        usedBytes,
        totalBytes,
        updatedAt,
        stale: false,
        esimStatus,
        activatedAt,
        expiresAt,
        smdpAddress,
        activationCode,
      });
    }

    try {
      const snapshot = await this.esimProviderService.getEsimSnapshot(order.iccid);
      const providerRemainingBytes =
        snapshot.remainingBytes !== null
          ? Math.max(0, Math.floor(snapshot.remainingBytes))
          : null;

      if (snapshot.usedBytes !== null) {
        usedBytes = Math.max(0, Math.floor(snapshot.usedBytes));
      }
      if (snapshot.totalBytes !== null) {
        totalBytes = Math.max(0, Math.floor(snapshot.totalBytes));
      }
      if (usedBytes === null && totalBytes !== null && providerRemainingBytes !== null) {
        usedBytes = Math.max(0, totalBytes - providerRemainingBytes);
      }
      if (
        usedBytes === null &&
        totalBytes !== null &&
        (snapshot.status === EsimStatus.NOT_INSTALLED || snapshot.status === EsimStatus.ACTIVE)
      ) {
        usedBytes = 0;
      }
      if (snapshot.activatedAt) activatedAt = snapshot.activatedAt;
      if (snapshot.expiresAt) expiresAt = snapshot.expiresAt;
      if (snapshot.smdpAddress) smdpAddress = snapshot.smdpAddress;
      if (snapshot.activationCode) activationCode = snapshot.activationCode;
      esimStatus = snapshot.status;

      // Кэшируем всё что обновилось — даже если usedBytes нет (для статуса/срока)
      updatedAt = new Date();
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          ...(usedBytes !== null
            ? { lastUsageBytes: BigInt(usedBytes!) }
            : {}),
          ...(snapshot.totalBytes !== null
            ? { lastUsageTotalBytes: BigInt(totalBytes!) }
            : {}),
          lastUsageAt: updatedAt,
          esimStatus: esimStatus,
          ...(snapshot.activatedAt ? { activatedAt: snapshot.activatedAt } : {}),
          ...(snapshot.expiresAt ? { expiresAt: snapshot.expiresAt } : {}),
          ...(snapshot.smdpAddress ? { smdpAddress: snapshot.smdpAddress } : {}),
          ...(snapshot.activationCode && !order.activationCode
            ? { activationCode: snapshot.activationCode }
            : {}),
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `Не удалось получить usage по ICCID ${order.iccid}: ${error.message}`,
      );

      // Если есть кэш и он не слишком старый — отдаём его как stale
      if (
        usedBytes !== null &&
        cachedAt !== null &&
        now - cachedAt < STALE_CACHE_LIMIT_SEC * 1000
      ) {
        stale = true;
      } else if (esimStatus || expiresAt) {
        // Расхода нет, но статус/срок раньше успели закэшировать — отдаём то что есть
        stale = true;
      } else {
        return this.buildUnavailableResponse(
          order,
          'Провайдер временно недоступен, попробуйте через минуту',
        );
      }
    }

    return this.buildUsageResponse(order, {
      usedBytes,
      totalBytes,
      updatedAt,
      stale,
      esimStatus,
      activatedAt,
      expiresAt,
      smdpAddress,
      activationCode,
    });
  }

  /**
   * Расчёт fallback-срока действия из createdAt + product.validityDays.
   * Используется когда провайдер ещё не отдаёт expiredTime (eSIM не активирована).
   */
  private fallbackExpiresAt(order: { createdAt: Date; product: { validityDays: number } | null; periodNum?: number | null }): Date | null {
    const days = order.periodNum ?? order.product?.validityDays;
    if (!days) return null;
    return new Date(order.createdAt.getTime() + days * 86400 * 1000);
  }

  private buildUnavailableResponse(
    order: { createdAt: Date; product: { validityDays: number } | null; esimStatus: string | null; activatedAt: Date | null; expiresAt: Date | null; periodNum?: number | null },
    reason: string,
  ) {
    return {
      available: false,
      reason,
      totalBytes: null,
      usedBytes: null,
      remainingBytes: null,
      updatedAt: null,
      stale: false,
      status: order.esimStatus ?? null,
      activatedAt: order.activatedAt ?? null,
      expiresAt: order.expiresAt ?? this.fallbackExpiresAt(order),
      percentTraffic: null,
      percentTime: null,
      validityDaysLeft: null,
      validityHoursLeft: null,
    };
  }

  private buildUsageResponse(
    order: { createdAt: Date; product: { validityDays: number } | null; periodNum?: number | null },
    snap: {
      usedBytes: number | null;
      totalBytes: number | null;
      updatedAt: Date | null;
      stale: boolean;
      esimStatus: string | null;
      activatedAt: Date | null;
      expiresAt: Date | null;
      smdpAddress: string | null;
      activationCode: string | null;
    },
  ) {
    const { usedBytes, totalBytes, updatedAt, stale, esimStatus, activatedAt, smdpAddress, activationCode } = snap;
    const expiresAt = snap.expiresAt ?? this.fallbackExpiresAt(order);

    const remainingBytes =
      totalBytes !== null && usedBytes !== null
        ? Math.max(0, totalBytes - usedBytes)
        : null;

    const percentTraffic =
      totalBytes !== null && totalBytes > 0 && remainingBytes !== null
        ? Math.min(100, Math.max(0, Math.round((remainingBytes / totalBytes) * 100)))
        : null;

    let percentTime: number | null = null;
    let validityDaysLeft: number | null = null;
    let validityHoursLeft: number | null = null;
    if (expiresAt) {
      const now = Date.now();
      const exp = expiresAt.getTime();
      const msLeft = Math.max(0, exp - now);
      validityDaysLeft = Math.floor(msLeft / 86400000);
      validityHoursLeft = Math.floor((msLeft % 86400000) / 3600000);
      
      const productValidity = order.periodNum ?? order.product?.validityDays;
      const totalMs = productValidity 
        ? productValidity * 86400000 
        : Math.max(1, exp - (activatedAt ?? order.createdAt).getTime());
        
      percentTime = Math.max(0, Math.min(100, Math.round((msLeft / totalMs) * 100)));
    }

    return {
      available: totalBytes !== null && (usedBytes !== null || remainingBytes !== null),
      totalBytes,
      usedBytes,
      remainingBytes,
      updatedAt,
      stale,
      status: esimStatus,
      activatedAt,
      expiresAt,
      percentTraffic,
      percentTime,
      validityDaysLeft,
      validityHoursLeft,
      smdpAddress,
      activationCode,
      ...(usedBytes === null
        ? { reason: 'Данные о расходе ещё не поступили от провайдера' }
        : {}),
    };
  }

  /**
   * Список пакетов пополнения для конкретного заказа (по ICCID).
   * Дополнительно конвертирует цену провайдера в RUB по системным настройкам,
   * чтобы фронт не дублировал логику ценообразования.
   */
  async getTopupPackagesForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) throw new BadRequestException('Заказ не найден');
    if (!order.iccid) {
      throw new BadRequestException('eSIM ещё не выдана — пополнение недоступно');
    }

    const [packages, pricing] = await Promise.all([
      this.esimProviderService.getTopupPackagesByIccid(order.iccid),
      this.systemSettingsService.getPricingSettings(),
    ]);

    return packages
      .filter((p: any) => p.supportTopup !== false)
      .map((p: any) => {
        const priceUsd = Number(p.price) / 10000;
        const priceRub = Math.round(
          priceUsd * (1 + pricing.defaultMarkupPercent / 100) * pricing.exchangeRate,
        );
        return {
          ...p,
          priceUsd,
          priceRub,
        };
      });
  }

  /**
   * Создать заказ-пополнение существующей eSIM.
   *
   * Поток:
   *  1. Проверяем владельца исходного заказа и наличие ICCID.
   *  2. Ищем пакет у провайдера, считаем стоимость в RUB по настройкам ценообразования.
   *  3. Если paymentMethod=balance — атомарно списываем с balance, ставим статус PAID
   *     и сразу запускаем fulfill (вызовет /esim/topup у провайдера).
   *  4. Если paymentMethod=card — создаём заказ в PENDING, фронт продолжит через
   *     обычный платёжный flow `/payments/create`.
   *
   * Возвращает: { order, paymentMethod, fulfillment? } — для balance уже выполненный
   * заказ; для card нужно создать платёж следующим шагом.
   */
  async createTopupOrder(parentOrderId: string, packageCode: string, requesterId: string, paymentMethod: 'balance' | 'card' = 'card') {
    if (!packageCode) {
      throw new BadRequestException('packageCode обязателен');
    }

    const parent = await this.prisma.order.findUnique({
      where: { id: parentOrderId },
      include: { product: true, user: true },
    });

    if (!parent) throw new BadRequestException('Исходный заказ не найден');
    if (parent.userId !== requesterId) {
      throw new ForbiddenException('Заказ принадлежит другому пользователю');
    }
    if (!parent.iccid) {
      throw new BadRequestException('eSIM ещё не выдана — пополнение недоступно');
    }

    // Получаем пакеты топ-апа и валидируем переданный packageCode
    const packages = await this.esimProviderService.getTopupPackagesByIccid(parent.iccid);
    const pkg = packages.find((p: any) => p.packageCode === packageCode);
    if (!pkg) {
      throw new BadRequestException('Пакет пополнения не найден или больше недоступен');
    }
    if (pkg.supportTopup === false) {
      throw new BadRequestException('Этот пакет не поддерживает пополнение');
    }

    // Считаем цену в RUB по тем же правилам, что и для основных тарифов
    const pricing = await this.systemSettingsService.getPricingSettings();
    const priceUsd = Number(pkg.price) / 10000;
    const priceRub = Math.round(
      priceUsd * (1 + pricing.defaultMarkupPercent / 100) * pricing.exchangeRate,
    );

    if (priceRub <= 0) {
      throw new BadRequestException('Не удалось рассчитать стоимость пополнения');
    }

    // === Balance flow: атомарно списываем и оплачиваем ===
    if (paymentMethod === 'balance') {
      const userBalance = Number(parent.user.balance);
      if (userBalance < priceRub) {
        throw new BadRequestException(
          `Недостаточно средств на балансе. Нужно ${priceRub}₽, есть ${userBalance}₽.`,
        );
      }

      const created = await this.prisma.$transaction(async (tx) => {
        // Повторно проверяем баланс ВНУТРИ транзакции, чтобы избежать race condition
        // (две одновременных кнопки «Пополнить» не должны увести баланс в минус).
        const userFresh = await tx.user.findUnique({
          where: { id: requesterId },
          select: { balance: true },
        });
        if (!userFresh || Number(userFresh.balance) < priceRub) {
          throw new BadRequestException('Недостаточно средств на балансе');
        }

        await tx.user.update({
          where: { id: requesterId },
          data: { balance: { decrement: new Prisma.Decimal(priceRub) } },
        });

        const newOrder = await tx.order.create({
          data: {
            userId: requesterId,
            productId: parent.productId,
            quantity: 1,
            productPrice: new Prisma.Decimal(priceRub),
            totalAmount: new Prisma.Decimal(priceRub),
            status: OrderStatus.PAID,
            parentOrderId: parent.id,
            topupPackageCode: packageCode,
          },
          include: { product: true, user: true },
        });

        await tx.transaction.create({
          data: {
            userId: requesterId,
            orderId: newOrder.id,
            type: TransactionType.PAYMENT,
            status: TransactionStatus.SUCCEEDED,
            amount: new Prisma.Decimal(priceRub),
            paymentProvider: 'balance',
            paymentMethod: 'balance',
            metadata: { purpose: 'topup', packageCode, parentOrderId: parent.id } as any,
          },
        });

        return newOrder;
      });

      // fulfill вне транзакции — обращение к внешнему API не должно держать локи
      try {
        const fulfilled = await this.fulfillOrder(created.id);
        return { order: fulfilled, paymentMethod: 'balance' as const };
      } catch (error: any) {
        if (this.isFulfillmentFinalizeError(error)) {
          throw error;
        }

        // Откатываем списание с баланса при провале провайдера
        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: requesterId },
            data: { balance: { increment: new Prisma.Decimal(priceRub) } },
          }),
          this.prisma.transaction.create({
            data: {
              userId: requesterId,
              orderId: created.id,
              type: TransactionType.REFUND,
              status: TransactionStatus.SUCCEEDED,
              amount: new Prisma.Decimal(priceRub),
              paymentProvider: 'balance',
              metadata: { purpose: 'topup_refund', reason: error.message } as any,
            },
          }),
          this.prisma.order.update({
            where: { id: created.id },
            data: { status: OrderStatus.FAILED, errorMessage: error.message },
          }),
        ]);
        throw new BadRequestException(
          `Пополнение не выполнено: ${error.message}. Деньги возвращены на баланс.`,
        );
      }
    }

    // === Card flow: создаём заказ в PENDING, фронт продолжит через /payments/create ===
    const newOrder = await this.prisma.order.create({
      data: {
        userId: requesterId,
        productId: parent.productId,
        quantity: 1,
        productPrice: new Prisma.Decimal(priceRub),
        totalAmount: new Prisma.Decimal(priceRub),
        status: OrderStatus.PENDING,
        parentOrderId: parent.id,
        topupPackageCode: packageCode,
      },
      include: { product: true, user: true },
    });

    return { order: newOrder, paymentMethod: 'card' as const };
  }

  /**
   * Купить eSIM с баланса пользователя — атомарное списание + немедленный fulfill.
   *
   * Поток:
   *  1. Считаем итоговую сумму через тот же `create()` (применяя промокод/бонусы/лояльность),
   *     но кладём заказ сразу в PAID и атомарно списываем balance внутри транзакции.
   *  2. Если баланса не хватает — `BadRequestException` с понятным текстом «Не хватает X ₽».
   *  3. После транзакции вызываем `fulfillOrder` (вне tx — внешний API не должен держать локи).
   *  4. Если провайдер отказал — refund (balance += amount) + Order.FAILED.
   *
   * Возвращает выполненный заказ с QR-кодом / ICCID.
   */
  async createWithBalance(
    userId: string,
    productId: string,
    opts?: {
      quantity?: number;
      useBonuses?: number;
      periodNum?: number;
      promoCode?: string;
    },
  ) {
    await this.cleanupExpiredBonusSpendHolds(userId);

    const pricing = await this.buildOrderPricingSnapshot(userId, productId, {
      quantity: opts?.quantity,
      useBonuses: opts?.useBonuses,
      periodNum: opts?.periodNum,
      promoCode: opts?.promoCode,
    });
    const priceRub = pricing.totalAmount;

    if (priceRub <= 0) {
      throw new BadRequestException(
        'Заказ бесплатный — используйте обычный POST /orders + /fulfill-free',
      );
    }

    const userBalance = Number(pricing.user.balance);
    if (userBalance < priceRub) {
      throw new BadRequestException(
        `Не хватает ${(priceRub - userBalance).toFixed(2)} ₽ на балансе. Пополните и повторите.`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const userFresh = await tx.user.findUnique({
        where: { id: userId },
        select: { balance: true },
      });
      if (!userFresh || Number(userFresh.balance) < priceRub) {
        throw new BadRequestException('Недостаточно средств на балансе');
      }

      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: new Prisma.Decimal(priceRub) } },
      });

      if (pricing.bonusUsed > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { bonusBalance: { decrement: new Prisma.Decimal(pricing.bonusUsed) } },
        });
      }

      const newOrder = await tx.order.create({
        data: {
          userId,
          productId,
          quantity: pricing.quantity,
          ...(pricing.product.isUnlimited && pricing.days > 1
            ? { periodNum: pricing.days }
            : {}),
          productPrice: pricing.product.ourPrice,
          discount: new Prisma.Decimal(pricing.loyaltyDiscount),
          promoCode: pricing.promoCode,
          promoCodeSource: pricing.promoCodeSource,
          promoDiscount: new Prisma.Decimal(pricing.promoDiscount),
          bonusUsed: new Prisma.Decimal(pricing.bonusUsed),
          totalAmount: new Prisma.Decimal(priceRub),
          status: OrderStatus.PAID,
        },
        include: { product: true, user: true },
      });

      await tx.transaction.create({
        data: {
          userId,
          orderId: newOrder.id,
          type: TransactionType.PAYMENT,
          status: TransactionStatus.SUCCEEDED,
          amount: new Prisma.Decimal(priceRub),
          paymentProvider: 'balance',
          paymentMethod: 'balance',
          metadata: { purpose: 'esim_purchase_balance' } as any,
        },
      });

      if (pricing.bonusUsed > 0) {
        await tx.transaction.create({
          data: {
            userId,
            orderId: newOrder.id,
            type: TransactionType.BONUS_SPENT,
            status: TransactionStatus.SUCCEEDED,
            amount: new Prisma.Decimal(pricing.bonusUsed),
            metadata: {
              source: 'order_bonus_spend',
              spentFromReferral: pricing.bonusSpend.spentFromReferral,
              spentFromCashback: pricing.bonusSpend.spentFromCashback,
            } as any,
          },
        });
      }

      if (pricing.promoCode && pricing.promoCodeSource) {
        await this.promoCodesService.reserveForOrder(
          pricing.promoCode,
          userId,
          newOrder.id,
          pricing.promoCodeSource === PromoCodeSource.MANUAL
            ? PromoCodeRedemptionSource.MANUAL
            : PromoCodeRedemptionSource.REFERRAL_LINK_AUTO,
          tx,
        );
      }

      return newOrder;
    });

    try {
      const fulfilled = await this.fulfillOrder(created.id);
      return { order: fulfilled, paymentMethod: 'balance' as const };
    } catch (error: any) {
      if (this.isFulfillmentFinalizeError(error)) {
        throw error;
      }

      // Откатываем списание при провале провайдера
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: new Prisma.Decimal(priceRub) } },
        });

        if (pricing.bonusUsed > 0) {
          await tx.user.update({
            where: { id: userId },
            data: {
              bonusBalance: { increment: new Prisma.Decimal(pricing.bonusUsed) },
            },
          });
          await tx.transaction.create({
            data: {
              userId,
              orderId: created.id,
              type: TransactionType.BONUS_ACCRUAL,
              status: TransactionStatus.SUCCEEDED,
              amount: new Prisma.Decimal(pricing.bonusUsed),
              metadata: {
                source: 'order_bonus_refund',
                restoredToReferral: pricing.bonusSpend.spentFromReferral,
                restoredToCashback: pricing.bonusSpend.spentFromCashback,
              } as any,
            },
          });
        }

        await tx.transaction.create({
          data: {
            userId,
            orderId: created.id,
            type: TransactionType.REFUND,
            status: TransactionStatus.SUCCEEDED,
            amount: new Prisma.Decimal(priceRub),
            paymentProvider: 'balance',
            metadata: { purpose: 'esim_purchase_refund', reason: error.message } as any,
          },
        });

        await this.markOrderFailed(
          created.id,
          { errorMessage: error.message },
          'provider_failed_after_balance_purchase',
          tx,
        );
      });
      throw new BadRequestException(
        `Покупка не выполнена: ${error.message}. Деньги возвращены на баланс.`,
      );
    }
  }

  /**
   * Внутренний метод: выполнить top-up через провайдера для уже PAID-заказа-пополнения.
   * Не вызывается напрямую из контроллеров; запускается из fulfillOrder.
   */
  private async fulfillTopupOrder(order: any) {
    const parent = await this.prisma.order.findUnique({
      where: { id: order.parentOrderId },
      select: { iccid: true, userId: true },
    });
    if (!parent || !parent.iccid) {
      await this.markOrderFailed(order.id, {
        errorMessage: 'У родительского заказа нет ICCID',
      });
      throw new BadRequestException('Родительская eSIM не найдена');
    }

    try {
      const result = await this.esimProviderService.topupEsim(
        parent.iccid,
        order.topupPackageCode,
        `topup_${order.id}_${Date.now()}`,
      );
      const topupSnapshot: Prisma.OrderUpdateInput = {
        providerOrderId: result.orderNo,
        providerResponse: result as any,
        completionAccountingStatus: CompletionAccountingStatus.NOT_REQUIRED,
        completionAccountingNextRetryAt: null,
        completionAccountingLastError: null,
      };

      let updated;
      try {
        updated = await this.markOrderCompleted(order.id, topupSnapshot);
      } catch (finalizeError) {
        await this.persistProviderIssuedButFinalizeFailed(
          order.id,
          'topup',
          topupSnapshot,
          finalizeError,
        );
      }

      // Сбрасываем кэш usage у родителя — чтобы при следующем запросе мы
      // пошли к провайдеру за свежими цифрами с учётом нового объёма.
      await this.prisma.order.update({
        where: { id: order.parentOrderId },
        data: {
          lastUsageAt: null,
          lastUsageTotalBytes: null,
          lowTrafficNotifiedAt: null,
        },
      });

      // Уведомляем пользователя об успешном пополнении
      const user = await this.prisma.user.findUnique({
        where: { id: order.userId },
        select: { telegramId: true },
      });
      if (user?.telegramId) {
        try {
          await this.telegramNotification.sendTextNotification(
            user.telegramId,
            '✅ <b>Пополнение eSIM выполнено</b>\n\n' +
              'Свежий объём трафика уже доступен. ' +
              'Откройте приложение, чтобы посмотреть остаток.',
            { openMyEsim: true },
          );
        } catch (e: any) {
          this.logger.warn(`Топ-ап уведомление не отправилось: ${e.message}`);
        }
      }

      return updated;
    } catch (error: any) {
      if (this.isFulfillmentFinalizeError(error)) {
        throw error;
      }

      await this.markOrderFailed(order.id, {
        errorMessage: error.message,
      });
      this.logReconciliationSignal(
        {
          id: order.id,
          status: OrderStatus.FAILED,
          parentOrderId: order.parentOrderId,
          errorMessage: error.message,
          transactions: order.transactions,
        },
        'topup',
      );
      throw error;
    }
  }

  /**
   * Получить все заказы (для админки)
   */
  async findAll(filters?: {
    status?: OrderStatus;
    reconciliation?: 'needs_attention';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      status,
      reconciliation,
      page = 1,
      limit: rawLimit = 20,
      sortBy,
      sortOrder,
    } = filters || {};
    const limit = Math.min(Math.max(1, rawLimit), 10000);
    const skip = (page - 1) * limit;

    const SORTABLE_FIELDS = new Set(['createdAt', 'totalAmount', 'productPrice', 'status']);
    const resolvedField = sortBy && SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';
    const resolvedOrder = sortOrder === 'asc' ? 'asc' as const : 'desc' as const;

    const where: Prisma.OrderWhereInput = {
      ...(status && { status }),
      ...(reconciliation === 'needs_attention'
        ? {
            OR: [
              {
                status: {
                  in: [
                    OrderStatus.PENDING,
                    OrderStatus.PAID,
                    OrderStatus.PROCESSING,
                    OrderStatus.FAILED,
                  ],
                },
                transactions: {
                  some: {
                    type: TransactionType.PAYMENT,
                    status: TransactionStatus.SUCCEEDED,
                  },
                },
              },
              {
                status: OrderStatus.COMPLETED,
                completionAccountingStatus: CompletionAccountingStatus.FAILED,
              },
              {
                repeatChargeAttempt: {
                  is: {
                    status: RepeatChargeAttemptStatus.AMBIGUOUS,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [resolvedField]: resolvedOrder },
        include: {
          product: true,
          user: {
            select: {
              id: true,
              telegramId: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          transactions: true,
          repeatChargeAttempt: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const decoratedOrders = orders
      .map((order) => this.decorateOrderWithReconciliation(order))
      .filter((order) =>
        reconciliation === 'needs_attention' ? order.reconciliation.needsAttention : true,
      );

    return {
      data: decoratedOrders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Отменить (архивировать) заказ из админки.
   * Допускается только для PENDING и FAILED.
   */
  async cancelOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!order) throw new BadRequestException('Заказ не найден');

    const cancellable: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.FAILED];
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException(
        `Нельзя отменить заказ в статусе "${order.status}". Допустимые: ${cancellable.join(', ')}`,
      );
    }

    return this.markOrderCancelled(
      orderId,
      {
        errorMessage: 'Отменён администратором',
      },
      'admin_cancel',
    );
  }
}
