// Общие типы для всех модулей проекта

export * from './contracts/checkout';
export * from './country-display';

export interface User {
  id: string;
  telegramId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  balance: number;
  bonusBalance: number;
  referralCode: string;
  totalSpent: number;
  createdAt: Date;
}

export interface EsimProduct {
  id: string;
  country: string;
  region?: string;
  name: string;
  description?: string;
  dataAmount: string;
  validityDays: number;
  providerPrice: number;
  ourPrice: number;
  isActive: boolean;
}

export interface Order {
  id: string;
  userId: string;
  productId: string;
  status: OrderStatus;
  quantity: number;
  totalAmount: number;
  qrCode?: string;
  iccid?: string;
  activationCode?: string;
  createdAt: Date;
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export interface Transaction {
  id: string;
  userId: string;
  orderId?: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  paymentProvider?: string;
  paymentId?: string;
  createdAt: Date;
}

export enum TransactionType {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  BONUS_ACCRUAL = 'BONUS_ACCRUAL',
  BONUS_SPENT = 'BONUS_SPENT',
  REFERRAL_BONUS = 'REFERRAL_BONUS',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface LoyaltyLevel {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discount: number;
}
