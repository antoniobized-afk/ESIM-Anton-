import { Prisma } from '@prisma/client';
import type {
  UserOrderReadModel,
  UserOrderStatus,
} from '@shared/contracts/user-order';

type NumericSource = Prisma.Decimal | number | string;
type DateSource = Date | string;

export type UserOrderSource = {
  id: string;
  userId: string;
  productId: string;
  status: UserOrderStatus;
  quantity: number;
  periodNum?: number | null;
  productPrice: NumericSource;
  discount: NumericSource;
  bonusUsed: NumericSource;
  totalAmount: NumericSource;
  qrCode?: string | null;
  iccid?: string | null;
  activationCode?: string | null;
  createdAt: DateSource;
  completedAt?: DateSource | null;
  esimStatus?: string | null;
  smdpAddress?: string | null;
  activatedAt?: DateSource | null;
  expiresAt?: DateSource | null;
  parentOrderId?: string | null;
  topupPackageCode?: string | null;
  product: {
    id: string;
    country: string;
    name: string;
    dataAmount: string;
    validityDays: number;
    supportTopup: boolean;
  };
};

function dateToIso(value: DateSource): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableDateToIso(value: DateSource | null | undefined): string | null {
  return value ? dateToIso(value) : null;
}

/**
 * Owner-facing order contract. Собирает новый объект и намеренно не переносит
 * internal user/payment/provider/reconciliation relations из Prisma payload.
 */
export function toUserOrderReadModel(order: UserOrderSource): UserOrderReadModel {
  return {
    id: order.id,
    userId: order.userId,
    productId: order.productId,
    product: {
      id: order.product.id,
      country: order.product.country,
      name: order.product.name,
      dataAmount: order.product.dataAmount,
      validityDays: order.product.validityDays,
      supportTopup: order.product.supportTopup,
    },
    status: order.status,
    quantity: Number(order.quantity),
    periodNum: order.periodNum ?? null,
    productPrice: Number(order.productPrice),
    discount: Number(order.discount),
    bonusUsed: Number(order.bonusUsed),
    totalAmount: Number(order.totalAmount),
    qrCode: order.qrCode ?? null,
    iccid: order.iccid ?? null,
    activationCode: order.activationCode ?? null,
    createdAt: dateToIso(order.createdAt),
    completedAt: nullableDateToIso(order.completedAt),
    esimStatus: order.esimStatus ?? null,
    smdpAddress: order.smdpAddress ?? null,
    activatedAt: nullableDateToIso(order.activatedAt),
    expiresAt: nullableDateToIso(order.expiresAt),
    parentOrderId: order.parentOrderId ?? null,
    topupPackageCode: order.topupPackageCode ?? null,
  };
}
