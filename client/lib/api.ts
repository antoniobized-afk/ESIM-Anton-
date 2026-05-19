import axios from 'axios';
import type {
  ChargeOrderWithSavedCardResponse,
  CreateOrderQuoteRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateTopupOrderRequest,
  CreateTopupOrderResponse,
  OrderQuoteResponse,
  SavedPaymentCardSummary,
} from '@shared/contracts/checkout';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Автоматически прикрепляем JWT-токен пользователя ко всем исходящим запросам.
// Токен хранится в localStorage (см. lib/auth.ts), здесь его читаем без прямого
// импорта, чтобы избежать SSR/циклических проблем.
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('mojo_auth_token');
    if (token && !config.headers?.Authorization) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Типы
export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  balance: number;
  bonusBalance: number;
  referralCode: string;
  loyaltyLevel?: LoyaltyLevel;
  totalSpent: number;
}

export interface LoyaltyLevel {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discount: number;
}

export interface LoyaltyProgram {
  totalSpent: number;
  bonusBalance: number;
  currentLevel: LoyaltyLevel | null;
  nextLevel: LoyaltyLevel | null;
  amountToNextLevel: number;
  progressToNextLevel: number;
  levels: LoyaltyLevel[];
  currentDiscount: number;
  currentCashbackPercent: number;
  effectiveLevelId: string | null;
}

export interface Product {
  id: string;
  country: string;
  region?: string;
  name: string;
  description?: string;
  dataAmount: string;
  validityDays: number;  // Для Daily Unlimited = срок действия (180 дней)
  duration?: number;     // Для Daily Unlimited = 1 (в день)
  speed?: string;        // Ограничение скорости после лимита (384 Kbps, 1 Mbps)
  providerPrice: number;
  ourPrice: number;
  providerId: string;
  providerName: string;
  isActive: boolean;
  isUnlimited: boolean;
  stock: number;
  // Бейджи (скидки, ХИТ, etc.)
  badge?: string;
  badgeColor?: string;
  // Произвольные пометки тарифа («Материковый Китай», «Не гонконгский IP», «5G» и т.д.)
  tags?: string[];
  notes?: string;
  // Поддерживает ли провайдер пополнение (top-up) данной eSIM. Для тарифов
  // с supportTopup=false фронт скрывает кнопку «Пополнить».
  supportTopup?: boolean;
}

export interface UsageInfo {
  available: boolean;
  reason?: string;
  stale?: boolean;
  usedBytes: number | null;
  totalBytes: number | null;
  remainingBytes: number | null;
  updatedAt: string | null;
  // Нормализованный статус eSIM (приходит с провайдера, кэшируется в БД).
  // Возможные значения: ACTIVE | NOT_INSTALLED | EXPIRED | USED_UP | CANCELLED | UNKNOWN
  status?: string | null;
  activatedAt?: string | null;
  expiresAt?: string | null;
  // Прогресс остатка трафика и остатка срока в процентах [0..100], считаются на бэке.
  percentTraffic?: number | null;
  percentTime?: number | null;
  validityDaysLeft?: number | null;
  validityHoursLeft?: number | null;
}

export interface TopupPackage {
  packageCode: string;
  name: string;
  slug?: string;
  location?: string;
  locationCode?: string;
  description?: string;
  price: number;        // в сотых центах USD (как у провайдера)
  currencyCode: string;
  volume: number;       // в байтах
  duration: number;
  durationUnit: string;
  speed?: string;
  supportTopup: boolean;
}

export interface Order {
  id: string;
  userId: string;
  productId: string;
  product: Product;
  status: 'PENDING' | 'PAID' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
  quantity: number;
  productPrice: number;
  discount: number;
  bonusUsed: number;
  totalAmount: number;
  qrCode?: string;
  iccid?: string;
  activationCode?: string;
  createdAt: string;
  completedAt?: string;
  // Снимок последнего известного состояния eSIM от провайдера.
  // Заполняется при выдаче eSIM и обновляется при каждом /usage-запросе.
  esimStatus?: string | null;
  smdpAddress?: string | null;
  activatedAt?: string | null;
  expiresAt?: string | null;
}

export type OrderQuote = OrderQuoteResponse;

export interface ReferralStats {
  referralCode: string;
  referralLink: string;
  referralsCount: number;
  totalEarned: number;
  totalEarnings: number;
  referralPercent: number;
  enabled: boolean;
  minPayout: number;
  referrals: Array<{
    id: string;
    name?: string;
    joinedAt: string;
    totalOrders: number;
    totalSpent: number;
  }>;
}

// API методы
export const userApi = {
  // Получить текущего пользователя
  async getMe(_telegramId?: string): Promise<User> {
    const { data } = await api.get('/auth/me');
    return data;
  },

  // Получить профиль
  async getProfile(userId: string): Promise<User> {
    const { data } = await api.get(`/users/${userId}`);
    return data;
  },
};

export const productsApi = {
  // Получить все продукты
  async getAll(filters?: { country?: string; isActive?: boolean }): Promise<Product[]> {
    const { data } = await api.get('/products', { params: filters });
    return Array.isArray(data) ? data : data?.data ?? [];
  },

  // Получить продукт по ID
  async getById(id: string): Promise<Product> {
    const { data } = await api.get(`/products/${id}`);
    return data;
  },

  // Получить список стран
  async getCountries(): Promise<string[]> {
    const { data } = await api.get('/products/countries');
    return data;
  },
};

export const ordersApi = {
  /**
   * Создать заказ. `userId` бэкенд берёт из JWT (в body не нужен).
   *
   * При `paymentMethod: 'balance'` — бэк атомарно списывает с баланса и сразу
   * выдаёт eSIM, ответ возвращает `{ order, paymentMethod: 'balance' }`
   * с уже выполненным заказом (qrCode/iccid внутри).
   *
   * Без `paymentMethod` (или `'card'`) — поведение прежнее: создаётся PENDING
   * заказ, фронт продолжает через CloudPayments виджет.
   */
  async create(orderData: CreateOrderRequest): Promise<CreateOrderResponse & { order: Order }> {
    const { data } = await api.post('/orders', orderData);
    return {
      ...data,
      order: data.order,
    };
  },

  async quote(orderData: CreateOrderQuoteRequest): Promise<OrderQuoteResponse> {
    const { data } = await api.post('/orders/quote', orderData);
    return {
      ...data,
      baseAmount: Number(data.baseAmount ?? 0),
      promoDiscount: Number(data.promoDiscount ?? 0),
      loyaltyDiscount: Number(data.loyaltyDiscount ?? 0),
      bonusUsed: Number(data.bonusUsed ?? 0),
      totalAmount: Number(data.totalAmount ?? 0),
      balanceSufficient: Boolean(data.balanceSufficient),
      currentLoyaltyLevel: data.currentLoyaltyLevel
        ? {
            ...data.currentLoyaltyLevel,
            minSpent: Number(data.currentLoyaltyLevel.minSpent ?? 0),
            cashbackPercent: Number(data.currentLoyaltyLevel.cashbackPercent ?? 0),
            discount: Number(data.currentLoyaltyLevel.discount ?? 0),
          }
        : null,
    };
  },

  // Получить заказы пользователя
  async getMy(userId: string): Promise<Order[]> {
    const { data } = await api.get(`/orders/user/${userId}`);
    return data;
  },

  // Получить заказ по ID
  async getById(orderId: string): Promise<Order> {
    const { data } = await api.get(`/orders/${orderId}`);
    return data;
  },

  // Проверить новые оплаченные заказы
  async checkNew(userId: string): Promise<{ hasNewOrders: boolean; latestOrder: Order | null }> {
    const { data } = await api.get(`/orders/user/${userId}/check-new`);
    return data;
  },

  // Получить расход трафика по eSIM
  async getUsage(orderId: string, force = false): Promise<UsageInfo> {
    const { data } = await api.get(`/orders/${orderId}/usage`, {
      params: force ? { force: 'true' } : undefined,
    });
    return data;
  },

  // Получить пакеты пополнения для конкретного eSIM
  async getTopupPackages(orderId: string): Promise<TopupPackage[]> {
    const { data } = await api.get(`/orders/${orderId}/topup-packages`);
    return data;
  },

  // Запустить пополнение
  async topup(
    orderId: string,
    payload: CreateTopupOrderRequest,
  ): Promise<CreateTopupOrderResponse & { order: Order }> {
    const { data } = await api.post(`/orders/${orderId}/topup`, payload);
    return {
      ...data,
      order: data.order,
    };
  },
};

export const referralsApi = {
  // Получить реферальную статистику
  async getStats(): Promise<ReferralStats> {
    const { data } = await api.get('/referrals/me');
    return {
      ...data,
      referralsCount: data.referralsCount ?? 0,
      totalEarned: Number(data.totalEarnings ?? data.totalEarned ?? 0),
      totalEarnings: Number(data.totalEarnings ?? data.totalEarned ?? 0),
      referralPercent: Number(data.referralPercent ?? 0),
      enabled: Boolean(data.enabled),
      minPayout: Number(data.minPayout ?? 0),
      referrals: data.referrals ?? [],
    };
  },

  // Получить рефералов
  async getReferrals(): Promise<ReferralStats['referrals']> {
    const stats = await this.getStats();
    return stats.referrals;
  },

  // Публичная информация о партнёрской ссылке (без JWT)
  async getPublicLinkInfo(code: string): Promise<{ isValid: boolean; promoCode: string | null }> {
    const { data } = await api.get(`/referrals/links/${encodeURIComponent(code)}/public`);
    return data;
  },

  // Привязать реферальный код через web (требует JWT)
  async registerWebReferral(referralCode: string): Promise<void> {
    await api.post('/referrals/register-web', { referralCode });
  },
};

export const promoApi = {
  async validate(code: string): Promise<{ valid: boolean; code: string; discountPercent: number }> {
    const { data } = await api.get('/promo-codes/validate', { params: { code } });
    return data;
  },
};

export const paymentsApi = {
  // Создать платеж через Robokassa
  async createPayment(orderId: string): Promise<{
    transaction: any;
    payment: {
      paymentId: string;
      paymentUrl: string;
      amount: number;
      currency: string;
    };
  }> {
    const { data } = await api.post(`/payments/create`, { orderId });
    return data;
  },

  // Подготовить пополнение личного баланса через CloudPayments.
  // Возвращает данные для открытия виджета `cp.CloudPayments`.
  async prepareCloudPaymentsBalanceTopup(amount: number): Promise<{
    provider: 'cloudpayments';
    invoiceId: string;
    amount: number;
    currency: string;
    publicId: string;
    accountId: string;
    description: string;
    data: { purpose: 'balance_topup'; userId: string; amount: number };
  }> {
    const { data } = await api.post(`/payments/balance/topup`, { amount });
    return data;
  },

  async getActiveSavedCard(): Promise<SavedPaymentCardSummary | null> {
    const { data } = await api.get('/payments/cards/active');
    return data;
  },

  async chargeOrderWithSavedCard(orderId: string): Promise<ChargeOrderWithSavedCardResponse> {
    const { data } = await api.post('/payments/charge-saved-card', { orderId });
    return {
      ...data,
      repeatChargeAttemptId: data.repeatChargeAttemptId ?? null,
      reasonCode:
        data.reasonCode === null || data.reasonCode === undefined
          ? null
          : Number(data.reasonCode),
      order: {
        ...data.order,
        quantity: Number(data.order.quantity ?? 0),
        periodNum: data.order.periodNum ?? null,
        productPrice: Number(data.order.productPrice ?? 0),
        discount: Number(data.order.discount ?? 0),
        promoDiscount: Number(data.order.promoDiscount ?? 0),
        bonusUsed: Number(data.order.bonusUsed ?? 0),
        totalAmount: Number(data.order.totalAmount ?? 0),
      },
    };
  },

  // Старый Robokassa-flow пополнения. Оставлен на случай fallback,
  // но из UI больше не вызывается.
  async topupBalanceRobokassa(amount: number): Promise<{
    transaction: any;
    payment: {
      paymentId: string;
      paymentUrl: string;
      amount: number;
      currency: string;
    };
  }> {
    const { data } = await api.post(`/payments/balance/topup`, {
      amount,
      provider: 'robokassa',
    });
    return data;
  },
};

export const loyaltyApi = {
  async getMyProgram(): Promise<LoyaltyProgram> {
    const { data } = await api.get('/loyalty/me');
    return {
      ...data,
      totalSpent: Number(data.totalSpent ?? 0),
      bonusBalance: Number(data.bonusBalance ?? 0),
      amountToNextLevel: Number(data.amountToNextLevel ?? 0),
      progressToNextLevel: Number(data.progressToNextLevel ?? 0),
      currentDiscount: Number(data.currentDiscount ?? 0),
      currentCashbackPercent: Number(data.currentCashbackPercent ?? 0),
      currentLevel: data.currentLevel
        ? {
            ...data.currentLevel,
            minSpent: Number(data.currentLevel.minSpent ?? 0),
            cashbackPercent: Number(data.currentLevel.cashbackPercent ?? 0),
            discount: Number(data.currentLevel.discount ?? 0),
          }
        : null,
      nextLevel: data.nextLevel
        ? {
            ...data.nextLevel,
            minSpent: Number(data.nextLevel.minSpent ?? 0),
            cashbackPercent: Number(data.nextLevel.cashbackPercent ?? 0),
            discount: Number(data.nextLevel.discount ?? 0),
          }
        : null,
      levels: Array.isArray(data.levels)
        ? data.levels.map((level: any) => ({
            ...level,
            minSpent: Number(level.minSpent ?? 0),
            cashbackPercent: Number(level.cashbackPercent ?? 0),
            discount: Number(level.discount ?? 0),
          }))
        : [],
    };
  },
};
