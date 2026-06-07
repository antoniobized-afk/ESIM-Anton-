import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ServiceTokenGuard } from '@/common/auth/service-token.guard';
import { JwtAdminGuard, JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  const usersService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    getUserStats: jest.fn(),
    findOrCreate: jest.fn(),
    updateEmail: jest.fn(),
  };
  const pushService = {
    getPublicKey: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };
  const mergePreflightService = {
    preflight: jest.fn(),
  };

  const controller = new UsersController(
    usersService as any,
    pushService as any,
    mergePreflightService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('findAll использует JwtAdminGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findAll);
    expect(guards).toEqual([JwtAdminGuard]);
  });

  it('findOrCreate использует ServiceTokenGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findOrCreate);
    expect(guards).toEqual([ServiceTokenGuard]);
  });

  it('findOrCreate передает валидированный bot payload в UsersService', async () => {
    usersService.findOrCreate.mockResolvedValue({ id: 'user_1', telegramId: 123456789n });

    const result = await controller.findOrCreate({
      telegramId: '123456789',
      username: 'mojo_user',
      utmSource: 'telegram',
    });

    expect(usersService.findOrCreate).toHaveBeenCalledWith(123456789n, {
      username: 'mojo_user',
      utmSource: 'telegram',
    });
    expect(result).toEqual({ id: 'user_1', telegramId: '123456789' });
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

  it('findOne запрещает user доступ к чужому профилю', async () => {
    await expect(
      controller.findOne('user_2', { id: 'user_1', type: 'user' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('updateMyEmail читает user.id из auth context', async () => {
    usersService.updateEmail.mockResolvedValue({ id: 'user_1', email: 'new@example.com' });

    const result = await controller.updateMyEmail(
      { id: 'user_1', type: 'user' },
      { email: 'new@example.com' },
    );

    expect(usersService.updateEmail).toHaveBeenCalledWith('user_1', 'new@example.com');
    expect(result).toEqual({ id: 'user_1', email: 'new@example.com' });
  });

  it('static push VAPID route объявлен раньше параметрического findOne', () => {
    const methodOrder = Object.getOwnPropertyNames(UsersController.prototype);
    expect(methodOrder.indexOf('getVapidPublicKey')).toBeLessThan(
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
