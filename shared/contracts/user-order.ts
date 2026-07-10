import type { CheckoutOrderStatus } from './checkout';

export type UserOrderStatus = CheckoutOrderStatus;

export interface UserOrderProductReadModel {
  id: string;
  country: string;
  name: string;
  dataAmount: string;
  validityDays: number;
  supportTopup: boolean;
}

export interface UserOrderReadModel {
  id: string;
  userId: string;
  productId: string;
  product: UserOrderProductReadModel;
  status: UserOrderStatus;
  quantity: number;
  periodNum: number | null;
  productPrice: number;
  discount: number;
  bonusUsed: number;
  totalAmount: number;
  qrCode: string | null;
  iccid: string | null;
  activationCode: string | null;
  createdAt: string;
  completedAt: string | null;
  esimStatus: string | null;
  smdpAddress: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  parentOrderId: string | null;
  topupPackageCode: string | null;
}
