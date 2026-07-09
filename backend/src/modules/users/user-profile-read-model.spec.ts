import { Prisma } from '@prisma/client';
import {
  toUserProfileReadModel,
  type UserProfileSource,
} from './user-profile-read-model';

function makeSource(
  overrides: Partial<UserProfileSource> = {},
): UserProfileSource {
  return {
    id: 'user_1',
    telegramId: 123456789n,
    username: 'mojo_user',
    firstName: 'Mojo',
    lastName: 'User',
    phone: null,
    email: 'owner@example.com',
    balance: new Prisma.Decimal('150.50'),
    bonusBalance: new Prisma.Decimal('10'),
    referralCode: 'ref_user_1',
    referredById: null,
    referralLinkId: null,
    totalSpent: new Prisma.Decimal('999.99'),
    loyaltyLevel: null,
    ...overrides,
  };
}

describe('toUserProfileReadModel', () => {
  it('конвертирует bigint/decimal в контрактные типы клиента', () => {
    const result = toUserProfileReadModel(makeSource());

    expect(result).toEqual({
      id: 'user_1',
      telegramId: '123456789',
      username: 'mojo_user',
      firstName: 'Mojo',
      lastName: 'User',
      phone: null,
      email: 'owner@example.com',
      balance: 150.5,
      bonusBalance: 10,
      referralCode: 'ref_user_1',
      referredById: null,
      referralLinkId: null,
      totalSpent: 999.99,
      loyaltyLevel: null,
    });
    expect(typeof result.telegramId).toBe('string');
    expect(typeof result.balance).toBe('number');
  });

  it('отдает telegramId=null без падения на bigint', () => {
    const result = toUserProfileReadModel(makeSource({ telegramId: null }));
    expect(result.telegramId).toBeNull();
  });

  it('маппит loyaltyLevel c decimal→number', () => {
    const result = toUserProfileReadModel(
      makeSource({
        loyaltyLevel: {
          id: 'level_1',
          name: 'Gold',
          minSpent: new Prisma.Decimal('1000'),
          cashbackPercent: new Prisma.Decimal('5'),
          discount: new Prisma.Decimal('3'),
        },
      }),
    );

    expect(result.loyaltyLevel).toEqual({
      id: 'level_1',
      name: 'Gold',
      minSpent: 1000,
      cashbackPercent: 5,
      discount: 3,
    });
  });

  it('whitelist: не протаскивает legacy slot и relation-объекты из источника', () => {
    // Источник намеренно содержит поля вне контракта (как реальный Prisma row).
    const dirtySource = Object.assign(makeSource(), {
      authProvider: 'telegram',
      providerId: 'legacy-id',
      isBlocked: true,
      referredBy: { id: 'referrer', authProvider: 'google', balance: 9999 },
      referrals: [{ id: 'invitee', authProvider: 'yandex' }],
    }) as UserProfileSource;

    const result = toUserProfileReadModel(dirtySource);

    expect(result).not.toHaveProperty('authProvider');
    expect(result).not.toHaveProperty('providerId');
    expect(result).not.toHaveProperty('isBlocked');
    expect(result).not.toHaveProperty('referredBy');
    expect(result).not.toHaveProperty('referrals');
  });
});
