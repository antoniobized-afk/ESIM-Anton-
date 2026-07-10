import type { UserOrderSource } from './user-order-read-model';
import { toUserOrderReadModel } from './user-order-read-model';

function makeSource(overrides: Partial<UserOrderSource> = {}): UserOrderSource {
  return {
    id: 'order_1',
    userId: 'user_1',
    productId: 'product_1',
    status: 'COMPLETED',
    quantity: 1,
    periodNum: null,
    productPrice: '100',
    discount: '10',
    bonusUsed: '5',
    totalAmount: '85',
    qrCode: 'qr',
    iccid: 'iccid-1',
    activationCode: 'activation',
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    completedAt: new Date('2026-07-10T00:01:00.000Z'),
    esimStatus: 'ACTIVE',
    smdpAddress: 'smdp.example',
    activatedAt: null,
    expiresAt: null,
    parentOrderId: null,
    topupPackageCode: null,
    product: {
      id: 'product_1',
      country: 'JP',
      name: 'Japan 10 GB',
      dataAmount: '10 GB',
      validityDays: 30,
      supportTopup: true,
    },
    ...overrides,
  };
}

describe('user order read model', () => {
  it('нормализует owner-facing order contract', () => {
    expect(toUserOrderReadModel(makeSource())).toEqual({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      product: {
        id: 'product_1',
        country: 'JP',
        name: 'Japan 10 GB',
        dataAmount: '10 GB',
        validityDays: 30,
        supportTopup: true,
      },
      status: 'COMPLETED',
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 10,
      bonusUsed: 5,
      totalAmount: 85,
      qrCode: 'qr',
      iccid: 'iccid-1',
      activationCode: 'activation',
      createdAt: '2026-07-10T00:00:00.000Z',
      completedAt: '2026-07-10T00:01:00.000Z',
      esimStatus: 'ACTIVE',
      smdpAddress: 'smdp.example',
      activatedAt: null,
      expiresAt: null,
      parentOrderId: null,
      topupPackageCode: null,
    });
  });

  it('whitelist не переносит internal relations, provider data и себестоимость', () => {
    const dirtySource = Object.assign(makeSource(), {
      user: { email: 'owner@example.com', authProvider: 'google' },
      transactions: [{ paymentId: 'payment-secret', metadata: { token: 'secret' } }],
      repeatChargeAttempt: {
        savedCardId: 'card-secret',
        idempotencyKey: 'idempotency-secret',
      },
      providerOrderId: 'provider-order-secret',
      providerResponse: { raw: 'provider-secret' },
      errorMessage: 'internal provider diagnostic',
      reconciliation: { providerMessage: 'internal diagnostic' },
      product: {
        ...makeSource().product,
        providerId: 'provider-plan-secret',
        providerPrice: 42,
        providerCostPerGb: 4.2,
        markupRatio: 2.38,
      },
    }) as UserOrderSource;

    const result = toUserOrderReadModel(dirtySource);

    expect(result).not.toHaveProperty('user');
    expect(result).not.toHaveProperty('transactions');
    expect(result).not.toHaveProperty('repeatChargeAttempt');
    expect(result).not.toHaveProperty('providerOrderId');
    expect(result).not.toHaveProperty('providerResponse');
    expect(result).not.toHaveProperty('errorMessage');
    expect(result).not.toHaveProperty('reconciliation');
    expect(result.product).not.toHaveProperty('providerId');
    expect(result.product).not.toHaveProperty('providerPrice');
    expect(result.product).not.toHaveProperty('providerCostPerGb');
    expect(result.product).not.toHaveProperty('markupRatio');
  });
});
