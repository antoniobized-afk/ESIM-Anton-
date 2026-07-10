import axios from 'axios';
import { config } from './config';

type BotUserInput = {
  username?: string;
  firstName?: string;
  lastName?: string;
};

type TelegramBotMarketingTouchInput = {
  userId: string;
  telegramId: string;
  startParam?: string;
  sourceEventKey?: string;
};

const client = axios.create({
  baseURL: `${config.apiUrl}/api`,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Только для captureTelegramBotTouch: initializedInSession уже потреблен к
// моменту вызова, поэтому упавший запрос без retry теряет touch навсегда.
// Retry только на network error / 429 / 5xx — прочие 4xx terminal.
const CAPTURE_BOT_TOUCH_RETRY_DELAYS_MS = [500, 2000];

function isRetryableCaptureBotTouchError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const api = {
  users: {
    findOrCreate: async (telegramId: bigint, data: BotUserInput) => {
      const response = await client.post(
        '/users/find-or-create',
        {
          telegramId: telegramId.toString(),
          ...data,
        },
        {
          headers: {
            'x-telegram-bot-token': config.botToken,
          },
        },
      );
      return response.data;
    },
    getStats: async (userId: string) => {
      const response = await client.get(`/users/${userId}/stats`);
      return response.data;
    },
  },

  products: {
    getAll: async () => {
      const response = await client.get('/products');
      return Array.isArray(response.data) ? response.data : response.data?.data ?? [];
    },
    getCountries: async () => {
      const response = await client.get('/products/countries');
      return response.data;
    },
    getByCountry: async (country: string) => {
      const response = await client.get(`/products?country=${country}`);
      return Array.isArray(response.data) ? response.data : response.data?.data ?? [];
    },
  },

  orders: {
    create: async (userId: string, productId: string, useBonuses = 0) => {
      const response = await client.post('/orders', {
        userId,
        productId,
        quantity: 1,
        useBonuses,
      });
      return response.data;
    },
    getByUser: async (userId: string) => {
      const response = await client.get(`/orders/user/${userId}`);
      return response.data;
    },
  },

  payments: {
    create: async (orderId: string) => {
      const response = await client.post('/payments/create', { orderId });
      return response.data;
    },
  },

  referrals: {
    register: async (userId: string, telegramId: bigint, referralCode: string) => {
      const response = await client.post(
        '/referrals/register',
        {
          userId,
          telegramId: telegramId.toString(),
          referralCode,
        },
        {
          headers: {
            'x-telegram-bot-token': config.botToken,
          },
        },
      );
      return response.data;
    },
  },

  marketingAttribution: {
    captureTelegramBotTouch: async (input: TelegramBotMarketingTouchInput) => {
      let lastError: unknown;
      for (let attempt = 0; attempt <= CAPTURE_BOT_TOUCH_RETRY_DELAYS_MS.length; attempt++) {
        try {
          const response = await client.post(
            '/marketing-attribution/telegram/bot/capture',
            input,
            {
              headers: {
                'x-telegram-bot-token': config.botToken,
              },
            },
          );
          return response.data;
        } catch (error) {
          lastError = error;
          const isLastAttempt = attempt === CAPTURE_BOT_TOUCH_RETRY_DELAYS_MS.length;
          if (isLastAttempt || !isRetryableCaptureBotTouchError(error)) {
            throw error;
          }
          await sleep(CAPTURE_BOT_TOUCH_RETRY_DELAYS_MS[attempt]);
        }
      }
      throw lastError;
    },
  },
};
