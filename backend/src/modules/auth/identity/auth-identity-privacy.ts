import { AuthIdentityProvider } from '@prisma/client';
import { createHash } from 'crypto';

export function subjectHash(providerSubject: string): string {
  return createHash('sha256').update(providerSubject).digest('hex');
}

export function subjectPreview(provider: AuthIdentityProvider, providerSubject: string): string {
  if (provider === AuthIdentityProvider.EMAIL) {
    return emailPreview(providerSubject);
  }

  return compactPreview(providerSubject);
}

export function withoutUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function emailPreview(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return compactPreview(email);

  const maskedName = name.length <= 2 ? `${name[0] ?? '*'}*` : `${name.slice(0, 2)}***`;
  return `${maskedName}@${domain}`;
}

function compactPreview(value: string): string {
  if (value.length === 0) return '***';
  if (value.length <= 2) return `${value.slice(0, 1)}***`;
  if (value.length <= 6) return `${value.slice(0, 1)}***${value.slice(-1)}`;
  return `${value.slice(0, 3)}...${value.slice(-2)}`;
}
