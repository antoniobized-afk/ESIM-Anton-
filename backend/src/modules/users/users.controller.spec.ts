import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';
import { ServiceTokenGuard } from '@/common/auth/service-token.guard';
import { JwtAdminGuard, JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { UsersController } from './users.controller';

// Реалистичный источник для user-facing profile projection: скаляры + legacy
// slot + вложенные relation-записи, как реально возвращает Prisma. Проверяем,
// что whitelist-проекция отдает только контрактные поля.
function makeUserSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    telegramId: 123456789n,
    username: 'mojo_user',
    firstName: 'Mojo',
    lastName: 'User',
    phone: null,
    email: 'owner@example.com',
    authProvider: 'telegram',
    providerId: '123456789',
    balance: new Prisma.Decimal('150.50'),
    bonusBalance: new Prisma.Decimal('10'),
    referralCode: 'ref_user_1',
    referredById: null,
    referralLinkId: null,
    totalSpent: new Prisma.Decimal('999.99'),
    isBlocked: false,
    loyaltyLevel: null,
    ...overrides,
  };
}

describe('UsersController', () => {
  const usersService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findAdminById: jest.fn(),
    getUserStats: jest.fn(),
    findOrCreate: jest.fn(),
    updateEmail: jest.fn(),
  };
  const pushService = {
    getPublicKey: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };
  const adminDeletionService = {
    deleteUser: jest.fn(),
  };
  const mergePreflightService = {
    preflight: jest.fn(),
  };

  const controller = new UsersController(
    usersService as any,
    pushService as any,
    adminDeletionService as any,
    mergePreflightService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('findAll использует JwtAdminGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findAll);
    expect(guards).toEqual([JwtAdminGuard]);
  });

  it('findAll передает DTO query и отдает admin read model без доп. проекции', async () => {
    // findAll(service) уже возвращает admin-safe read model (telegramId строкой,
    // без legacy slot); контроллер отдает его как есть.
    usersService.findAll.mockResolvedValue({
      data: [{ id: 'user_1', telegramId: '123456789' }],
      meta: { total: 1, page: 2, limit: 10, totalPages: 1 },
    });

    const result = await controller.findAll({
      page: 2,
      limit: 10,
      search: 'owner@example.com',
      sortBy: 'balance',
      sortOrder: 'asc',
    });

    expect(usersService.findAll).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      search: 'owner@example.com',
      sortBy: 'balance',
      sortOrder: 'asc',
    });
    expect(result).toEqual({
      data: [{ id: 'user_1', telegramId: '123456789' }],
      meta: { total: 1, page: 2, limit: 10, totalPages: 1 },
    });
  });

  it('findOrCreate использует ServiceTokenGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findOrCreate);
    expect(guards).toEqual([ServiceTokenGuard]);
  });

  it('findOrCreate передает bot payload и отдает profile без legacy slot', async () => {
    usersService.findOrCreate.mockResolvedValue(makeUserSource());

    const result = await controller.findOrCreate({
      telegramId: '123456789',
      username: 'mojo_user',
      utmSource: 'telegram',
    });

    expect(usersService.findOrCreate).toHaveBeenCalledWith(123456789n, {
      username: 'mojo_user',
      utmSource: 'telegram',
    });
    expect(result).toMatchObject({
      id: 'user_1',
      telegramId: '123456789',
      balance: 150.5,
      bonusBalance: 10,
      totalSpent: 999.99,
    });
    expect(result).not.toHaveProperty('authProvider');
    expect(result).not.toHaveProperty('providerId');
  });

  it('mergePreflight использует JwtAdminGuard и вызывает read-only service', async () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.mergePreflight);
    mergePreflightService.preflight.mockResolvedValue({ mode: 'read_only_preflight' });

    const result = await controller.mergePreflight(
      { sourceUserId: 'source_1', targetUserId: 'target_1' },
      { id: 'admin_1', type: 'admin', role: 'SUPPORT' },
    );

    expect(guards).toEqual([JwtAdminGuard]);
    expect(mergePreflightService.preflight).toHaveBeenCalledWith(
      'source_1',
      'target_1',
      { id: 'admin_1', type: 'admin', role: 'SUPPORT' },
    );
    expect(result).toEqual({ mode: 'read_only_preflight' });
  });

  it('findAdminOne использует JwtAdminGuard и admin-safe read model service', async () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findAdminOne);
    const adminDetail = {
      id: 'user_1',
      identityProviders: [],
      attributionSummary: { buckets: [{ kind: 'unknown', label: 'Неизвестно' }] },
    };
    usersService.findAdminById.mockResolvedValue(adminDetail);

    const result = await controller.findAdminOne('user_1');

    expect(guards).toEqual([JwtAdminGuard]);
    expect(usersService.findAdminById).toHaveBeenCalledWith('user_1');
    expect(result).toEqual(adminDetail);
  });

  it('deleteUser доступен только SUPER_ADMIN и вызывает deletion service', async () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.deleteUser);
    adminDeletionService.deleteUser.mockResolvedValue({
      success: true,
      deletedUserId: 'user_1',
    });

    const result = await controller.deleteUser(
      'user_1',
      { id: 'admin_1', type: 'admin', role: 'SUPER_ADMIN' },
    );

    expect(guards).toEqual([JwtAdminGuard]);
    expect(adminDeletionService.deleteUser).toHaveBeenCalledWith('user_1');
    expect(result).toEqual({ success: true, deletedUserId: 'user_1' });
  });

  it('deleteUser отклоняет non-SUPER_ADMIN', async () => {
    await expect(
      controller.deleteUser(
        'user_1',
        { id: 'admin_1', type: 'admin', role: 'SUPPORT' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('findOne запрещает user доступ к чужому профилю', async () => {
    await expect(
      controller.findOne('user_2', { id: 'user_1', type: 'user' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('findOne не использует admin-only detail read model и не отдает legacy identity slot', async () => {
    usersService.findById.mockResolvedValue(makeUserSource());

    const result = await controller.findOne('user_1', { id: 'user_1', type: 'user' });

    expect(usersService.findById).toHaveBeenCalledWith('user_1');
    expect(usersService.findAdminById).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'user_1', telegramId: '123456789' });
    expect(result).not.toHaveProperty('authProvider');
    expect(result).not.toHaveProperty('providerId');
  });

  it('findOne очищает вложенные referredBy/referrals от legacy identity slot и чужих данных', async () => {
    // Регрессия на audit-находку Step 04: whitelist-проекция не должна
    // протаскивать legacy slot и финансовые данные чужих пользователей через
    // relation-объекты, даже если источник их содержит.
    usersService.findById.mockResolvedValue(
      makeUserSource({
        referredBy: {
          id: 'referrer_1',
          authProvider: 'google',
          providerId: 'secret-provider-id',
          balance: new Prisma.Decimal('9999'),
          email: 'referrer@example.com',
          phone: '+70000000000',
        },
        referrals: [
          {
            id: 'invitee_1',
            authProvider: 'yandex',
            providerId: 'another-secret',
            balance: new Prisma.Decimal('500'),
            email: 'invitee@example.com',
          },
        ],
      }),
    );

    const result = await controller.findOne('user_1', { id: 'user_1', type: 'admin' });

    expect(result).not.toHaveProperty('referredBy');
    expect(result).not.toHaveProperty('referrals');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret-provider-id');
    expect(serialized).not.toContain('another-secret');
    expect(serialized).not.toContain('referrer@example.com');
    expect(serialized).not.toContain('invitee@example.com');
  });

  it('updateMyEmail читает user.id из auth context и отдает profile без legacy slot', async () => {
    usersService.updateEmail.mockResolvedValue(
      makeUserSource({ email: 'new@example.com' }),
    );

    const result = await controller.updateMyEmail(
      { id: 'user_1', type: 'user' },
      { email: 'new@example.com' },
    );

    expect(usersService.updateEmail).toHaveBeenCalledWith('user_1', 'new@example.com');
    expect(result).toMatchObject({ id: 'user_1', email: 'new@example.com' });
    expect(result).not.toHaveProperty('authProvider');
    expect(result).not.toHaveProperty('providerId');
  });

  it('static push VAPID route объявлен раньше параметрического findOne', () => {
    const methodOrder = Object.getOwnPropertyNames(UsersController.prototype);
    expect(methodOrder.indexOf('getVapidPublicKey')).toBeLessThan(
      methodOrder.indexOf('findOne'),
    );
    expect(methodOrder.indexOf('mergePreflight')).toBeLessThan(
      methodOrder.indexOf('findAdminOne'),
    );
    expect(methodOrder.indexOf('findAdminOne')).toBeLessThan(
      methodOrder.indexOf('findOne'),
    );
  });

  it('subscribePush запрещает чужой userId', async () => {
    await expect(
      controller.subscribePush(
        'user_2',
        { id: 'user_1', type: 'user' },
        { endpoint: 'ep', p256dh: 'p', auth: 'a' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('subscribePush использует JwtUserGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.subscribePush);
    expect(guards).toEqual([JwtUserGuard]);
  });
});
