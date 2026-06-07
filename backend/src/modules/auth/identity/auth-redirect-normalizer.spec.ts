import { normalizeRelativeReturnTo } from './auth-redirect-normalizer';

describe('normalizeRelativeReturnTo', () => {
  it('keeps local relative paths with query and hash', () => {
    expect(normalizeRelativeReturnTo('/profile?tab=login#methods')).toBe(
      '/profile?tab=login#methods',
    );
    expect(normalizeRelativeReturnTo('%2Fprofile%3Ftab%3Dlogin')).toBe(
      '/profile?tab=login',
    );
  });

  it('rejects external, protocol-relative and malformed returnTo values', () => {
    expect(normalizeRelativeReturnTo('https://evil.example/phish')).toBe('/');
    expect(normalizeRelativeReturnTo('//evil.example/phish')).toBe('/');
    expect(normalizeRelativeReturnTo('%2F%2Fevil.example')).toBe('/');
    expect(normalizeRelativeReturnTo('%E0%A4%A')).toBe('/');
  });

  it('rejects backslash variants', () => {
    expect(normalizeRelativeReturnTo('/\\evil')).toBe('/');
    expect(normalizeRelativeReturnTo('/%5Cevil')).toBe('/');
  });

  it('uses a safe fallback', () => {
    expect(normalizeRelativeReturnTo(null, '/profile')).toBe('/profile');
    expect(normalizeRelativeReturnTo(null, 'https://evil.example')).toBe('/');
  });
});
