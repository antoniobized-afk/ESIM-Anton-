import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  SendEmailAuthCodeDto,
  TelegramWebAppAuthDto,
  VerifyEmailAuthCodeDto,
} from './auth-login.dto';
import {
  SendEmailIdentityLinkCodeDto,
  StartOAuthIdentityLinkDto,
  TelegramWebAppIdentityLinkDto,
  VerifyEmailIdentityLinkDto,
} from './identity-link.dto';

function isValid<T extends object>(dto: new () => T, value: Record<string, unknown>) {
  return validateSync(plainToInstance(dto, value)).length === 0;
}

describe('identity link DTOs', () => {
  it('validates legacy email auth request payloads', () => {
    expect(isValid(SendEmailAuthCodeDto, { email: 'user@example.com' })).toBe(true);
    expect(isValid(SendEmailAuthCodeDto, { email: 'bad-email' })).toBe(false);
    expect(isValid(VerifyEmailAuthCodeDto, {
      email: 'user@example.com',
      code: '123456',
    })).toBe(true);
    expect(isValid(VerifyEmailAuthCodeDto, {
      email: 'user@example.com',
      code: 'abc123',
    })).toBe(false);
  });

  it('validates Telegram WebApp auth payload shape', () => {
    expect(isValid(TelegramWebAppAuthDto, { initData: 'query_id=1&hash=abc' })).toBe(true);
    expect(isValid(TelegramWebAppAuthDto, { initData: '' })).toBe(false);
  });

  it('validates OAuth link returnTo as local path only', () => {
    expect(isValid(StartOAuthIdentityLinkDto, { returnTo: '/profile?tab=login' })).toBe(true);
    expect(isValid(StartOAuthIdentityLinkDto, { returnTo: 'https://evil.example' })).toBe(false);
    expect(isValid(StartOAuthIdentityLinkDto, { returnTo: '//evil.example' })).toBe(false);
  });

  it('validates email link request payloads', () => {
    expect(isValid(SendEmailIdentityLinkCodeDto, { email: 'user@example.com' })).toBe(true);
    expect(isValid(SendEmailIdentityLinkCodeDto, { email: 'bad-email' })).toBe(false);
    expect(isValid(VerifyEmailIdentityLinkDto, {
      email: 'user@example.com',
      code: '123456',
    })).toBe(true);
    expect(isValid(VerifyEmailIdentityLinkDto, {
      email: 'user@example.com',
      code: 'abc123',
    })).toBe(false);
  });

  it('validates Telegram WebApp link payload shape', () => {
    expect(isValid(TelegramWebAppIdentityLinkDto, { initData: 'query_id=1&hash=abc' })).toBe(true);
    expect(isValid(TelegramWebAppIdentityLinkDto, { initData: '' })).toBe(false);
  });
});
