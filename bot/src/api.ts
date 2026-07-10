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
  headers: {
    'Content-Type': 'application/json',
  },
});

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
    },
  },
};
