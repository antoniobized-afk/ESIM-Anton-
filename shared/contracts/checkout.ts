export type CheckoutPaymentMethod = 'card' | 'balance';

export type CheckoutOrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED';

export interface CheckoutLoyaltyLevel {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discount: number;
}

export type CheckoutPromoCodeSource = 'MANUAL' | 'REFERRAL_LINK_AUTO';
export type CheckoutPromoStatus = 'applied' | 'none' | 'unavailable';

export interface CheckoutOrder {
  id: string;
  userId: string;
  productId: string;
  status: CheckoutOrderStatus;
  quantity: number;
  periodNum?: number | null;
  productPrice: number;
  discount: number;
  promoCode?: string | null;
  promoDiscount: number;
  bonusUsed: number;
  totalAmount: number;
  parentOrderId?: string | null;
  topupPackageCode?: string | null;
  createdAt?: string | Date;
  completedAt?: string | Date | null;
}

export interface SavedPaymentCardSummary {
  id: string;
  cardMask: string;
  cardBrand?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  isActive: boolean;
  lastUsedAt?: string | Date | null;
}

export interface CreateOrderQuoteRequest {
  productId: string;
  quantity?: number;
  useBonuses?: number;
  periodNum?: number;
  promoCode?: string;
}

export interface CreateOrderRequest extends CreateOrderQuoteRequest {
  paymentMethod?: CheckoutPaymentMethod;
  email?: string;
}

export interface OrderQuoteResponse {
  productId: string;
  quantity: number;
  periodNum: number | null;
  baseAmount: number;
  promoCode: string | null;
  promoCodeSource: CheckoutPromoCodeSource | null;
  promoStatus: CheckoutPromoStatus;
  promoMessage: string | null;
  hasReferralAttribution: boolean;
  promoDiscount: number;
  loyaltyDiscount: number;
  bonusUsed: number;
  totalAmount: number;
  isFree: boolean;
  balanceSufficient: boolean;
  currentLoyaltyLevel: CheckoutLoyaltyLevel | null;
}

export interface CreateOrderResponse {
  paymentMethod: CheckoutPaymentMethod;
  order: CheckoutOrder;
}

export interface CreateTopupOrderRequest {
  packageCode: string;
  paymentMethod?: CheckoutPaymentMethod;
}

export interface CreateTopupOrderResponse {
  paymentMethod: CheckoutPaymentMethod;
  order: CheckoutOrder;
}

export type BalanceTopupProvider = 'cloudpayments' | 'robokassa';

export interface CreatePaymentRequest {
  orderId: string;
}

export interface CreateBalanceTopupRequest {
  amount: number;
  provider?: BalanceTopupProvider;
}

export interface ChargeOrderWithSavedCardRequest {
  orderId: string;
}

export type SavedCardChargeState =
  | 'succeeded'
  | 'declined'
  | 'in_progress'
  | 'ambiguous';

export interface ChargeOrderWithSavedCardResponse {
  success: boolean;
  chargeState: SavedCardChargeState;
  fallbackToWidget: boolean;
  order: CheckoutOrder;
  savedCard: SavedPaymentCardSummary | null;
  repeatChargeAttemptId?: string | null;
  message?: string | null;
  reasonCode?: number | null;
}
