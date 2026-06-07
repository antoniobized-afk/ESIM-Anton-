import { ConflictException } from '@nestjs/common';
import { AuthIdentityProvider } from '@prisma/client';

export const AUTH_IDENTITY_CONFLICT_CODES = [
  'OAUTH_EMAIL_ALREADY_USED',
  'EMAIL_NORMALIZED_DUPLICATE',
  'EMAIL_ALREADY_USED_BY_ANOTHER_ACCOUNT',
  'TELEGRAM_CONTACT_ALREADY_USED_BY_ANOTHER_ACCOUNT',
  'TELEGRAM_IDENTITY_CONTACT_DRIFT',
  'PROVIDER_IDENTITY_ALREADY_LINKED',
  'PROVIDER_ALREADY_LINKED_TO_USER',
] as const;

export type AuthIdentityConflictCode =
  (typeof AUTH_IDENTITY_CONFLICT_CODES)[number];

export type AuthIdentityConflictAuditContext = {
  code: AuthIdentityConflictCode;
  userId?: string;
  attemptedUserId?: string;
  conflictingUserId?: string;
};

export class AuthIdentityConflictException extends ConflictException {
  constructor(
    response: {
      code: AuthIdentityConflictCode;
      message: string;
      provider?: AuthIdentityProvider;
    },
    readonly auditContext: AuthIdentityConflictAuditContext,
  ) {
    super(response);
  }
}

export function isAuthIdentityConflictException(
  error: unknown,
): error is AuthIdentityConflictException {
  return error instanceof AuthIdentityConflictException;
}
