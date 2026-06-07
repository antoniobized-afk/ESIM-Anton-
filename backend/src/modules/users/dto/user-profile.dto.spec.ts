import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FindOrCreateUserDto } from './find-or-create-user.dto';
import { MergePreflightQueryDto } from './merge-preflight.dto';
import { PushSubscribeDto, PushUnsubscribeDto } from './push-subscription.dto';
import { UpdateMyEmailDto } from './user-profile.dto';

function isValid<T extends object>(dto: new () => T, value: Record<string, unknown>) {
  return validateSync(plainToInstance(dto, value)).length === 0;
}

describe('users DTOs', () => {
  it('validates merge preflight query ids', () => {
    expect(isValid(MergePreflightQueryDto, {
      sourceUserId: 'source_1',
      targetUserId: 'target_1',
    })).toBe(true);
    expect(isValid(MergePreflightQueryDto, { sourceUserId: 'source_1' })).toBe(false);
    expect(isValid(MergePreflightQueryDto, {
      sourceUserId: '',
      targetUserId: 'target_1',
    })).toBe(false);
  });

  it('validates current user email update payload', () => {
    expect(isValid(UpdateMyEmailDto, { email: 'user@example.com' })).toBe(true);
    expect(isValid(UpdateMyEmailDto, { email: 'bad-email' })).toBe(false);
    expect(isValid(UpdateMyEmailDto, { email: 123 })).toBe(false);
  });

  it('validates bot find-or-create payload', () => {
    expect(isValid(FindOrCreateUserDto, {
      telegramId: '123456789',
      username: 'mojo_user',
      utmSource: 'telegram',
    })).toBe(true);
    expect(isValid(FindOrCreateUserDto, { telegramId: 'abc' })).toBe(false);
    expect(isValid(FindOrCreateUserDto, { telegramId: '' })).toBe(false);
  });

  it('validates push subscription payloads', () => {
    expect(isValid(PushSubscribeDto, {
      endpoint: 'https://push.example/subscription',
      p256dh: 'p256dh',
      auth: 'auth',
    })).toBe(true);
    expect(isValid(PushSubscribeDto, {
      endpoint: '',
      p256dh: 'p256dh',
      auth: 'auth',
    })).toBe(false);
    expect(isValid(PushUnsubscribeDto, {
      endpoint: 'https://push.example/subscription',
    })).toBe(true);
    expect(isValid(PushUnsubscribeDto, { endpoint: '' })).toBe(false);
  });
});
