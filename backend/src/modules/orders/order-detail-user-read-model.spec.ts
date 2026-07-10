import type { OrderDetailUserSource } from './order-detail-user-read-model';
import {
  ORDER_DETAIL_USER_SELECT,
  toOrderDetailUserReadModel,
} from './order-detail-user-read-model';

function makeSource(
  overrides: Partial<OrderDetailUserSource> = {},
): OrderDetailUserSource {
  return {
    id: 'user_1',
    telegramId: 123456789n,
    username: 'mojo_user',
    firstName: 'Mojo',
    lastName: 'User',
    email: 'owner@example.com',
    ...overrides,
  };
}

describe('order detail user read model', () => {
  it('отдает только order-scoped contact/display contract', () => {
    expect(toOrderDetailUserReadModel(makeSource())).toEqual({
      id: 'user_1',
      telegramId: '123456789',
      username: 'mojo_user',
      firstName: 'Mojo',
      lastName: 'User',
      email: 'owner@example.com',
    });
  });

  it('whitelist не протаскивает legacy slot, финансы и чужого реферера', () => {
    const dirtySource = Object.assign(makeSource(), {
      authProvider: 'google',
      providerId: 'legacy-provider-subject',
      balance: 1000,
      bonusBalance: 500,
      phone: '+79999999999',
      referredById: 'referrer_1',
      referralLinkId: 'referral_link_1',
      referredBy: {
        id: 'referrer_1',
        email: 'referrer@example.com',
        balance: 9999,
        authProvider: 'telegram',
        providerId: 'foreign-provider-subject',
      },
    }) as OrderDetailUserSource;

    const result = toOrderDetailUserReadModel(dirtySource);

    expect(result).not.toHaveProperty('authProvider');
    expect(result).not.toHaveProperty('providerId');
    expect(result).not.toHaveProperty('balance');
    expect(result).not.toHaveProperty('bonusBalance');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('referredById');
    expect(result).not.toHaveProperty('referralLinkId');
    expect(result).not.toHaveProperty('referredBy');
    expect(ORDER_DETAIL_USER_SELECT).not.toHaveProperty('referredById');
    expect(ORDER_DETAIL_USER_SELECT).not.toHaveProperty('referralLinkId');
    expect(ORDER_DETAIL_USER_SELECT).not.toHaveProperty('referredBy');
  });
});
