import { Injectable } from '@nestjs/common';
import {
  AuthIdentityProvider,
  Prisma,
  UserIdentityAuditActorType,
  UserIdentityAuditEvent,
} from '@prisma/client';
import { subjectHash, subjectPreview, withoutUndefined } from '../identity/auth-identity-privacy';
import { AuthIdentityInput } from './auth-identity-resolver.types';

type UserIdentityAuditClient = {
  userIdentityAudit: Prisma.TransactionClient['userIdentityAudit'];
};

@Injectable()
export class AuthIdentityAuditService {
  async recordLinked(
    tx: UserIdentityAuditClient,
    params: {
      identityId: string;
      userId: string;
      input: AuthIdentityInput;
      reason: string;
      actorType?: UserIdentityAuditActorType;
      actorId?: string;
      source?: string;
    },
  ): Promise<void> {
    await tx.userIdentityAudit.create({
      data: {
        event: UserIdentityAuditEvent.LINKED,
        identityId: params.identityId,
        userId: params.userId,
        actorType: params.actorType ?? UserIdentityAuditActorType.SYSTEM,
        actorId: params.actorId,
        provider: params.input.provider,
        providerSubjectHash: subjectHash(params.input.providerSubject),
        providerSubjectPreview: subjectPreview(
          params.input.provider,
          params.input.providerSubject,
        ),
        reason: params.reason,
        after: this.snapshot(params.input, params.userId) as Prisma.InputJsonValue,
        metadata: {
          phase: 'phase18',
          source: params.source ?? 'identity_resolver_login',
        },
      },
    });
  }

  async recordUnlinked(
    tx: UserIdentityAuditClient,
    params: {
      identity: {
        id: string;
        userId: string;
        provider: AuthIdentityInput['provider'];
        providerSubject: string;
        email: string | null;
        emailVerified: boolean;
        displayName: string | null;
        linkedAt: Date;
        lastLoginAt: Date | null;
      };
      actorId: string;
      reason: string;
    },
  ): Promise<void> {
    await tx.userIdentityAudit.create({
      data: {
        event: UserIdentityAuditEvent.UNLINKED,
        identityId: params.identity.id,
        userId: params.identity.userId,
        actorType: UserIdentityAuditActorType.USER,
        actorId: params.actorId,
        provider: params.identity.provider,
        providerSubjectHash: subjectHash(params.identity.providerSubject),
        providerSubjectPreview: subjectPreview(
          params.identity.provider,
          params.identity.providerSubject,
        ),
        reason: params.reason,
        before: this.identitySnapshot(params.identity) as Prisma.InputJsonValue,
        metadata: {
          phase: 'phase18',
          source: 'identity_management_unlink',
        },
      },
    });
  }

  async recordLoginConflict(
    client: UserIdentityAuditClient,
    params: {
      input: AuthIdentityInput;
      reason: string;
      userId?: string;
      actorType?: UserIdentityAuditActorType;
      actorId?: string;
      attemptedUserId?: string;
      conflictingUserId?: string;
      source?: string;
    },
  ): Promise<void> {
    await client.userIdentityAudit.create({
      data: {
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: params.userId,
        actorType: params.actorType ?? UserIdentityAuditActorType.SYSTEM,
        actorId: params.actorId,
        provider: params.input.provider,
        providerSubjectHash: subjectHash(params.input.providerSubject),
        providerSubjectPreview: subjectPreview(
          params.input.provider,
          params.input.providerSubject,
        ),
        reason: params.reason,
        metadata: this.conflictMetadata(params) as Prisma.InputJsonValue,
      },
    });
  }

  private snapshot(input: AuthIdentityInput, userId: string): Record<string, unknown> {
    return withoutUndefined({
      userId,
      provider: input.provider,
      providerSubjectHash: subjectHash(input.providerSubject),
      providerSubjectPreview: subjectPreview(input.provider, input.providerSubject),
      emailHash: input.email ? subjectHash(input.email) : undefined,
      emailPreview: input.email
        ? subjectPreview(AuthIdentityProvider.EMAIL, input.email)
        : undefined,
      emailVerified: input.emailVerified,
      username: input.username,
      hasTelegramId: input.telegramId !== undefined,
    });
  }

  private identitySnapshot(identity: {
    id: string;
    userId: string;
    provider: AuthIdentityInput['provider'];
    providerSubject: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    linkedAt: Date;
    lastLoginAt: Date | null;
  }): Record<string, unknown> {
    return withoutUndefined({
      id: identity.id,
      userId: identity.userId,
      provider: identity.provider,
      providerSubjectHash: subjectHash(identity.providerSubject),
      providerSubjectPreview: subjectPreview(identity.provider, identity.providerSubject),
      emailHash: identity.email ? subjectHash(identity.email) : undefined,
      emailPreview: identity.email
        ? subjectPreview(AuthIdentityProvider.EMAIL, identity.email)
        : undefined,
      emailVerified: identity.emailVerified,
      displayName: identity.displayName,
      linkedAt: identity.linkedAt.toISOString(),
      lastLoginAt: identity.lastLoginAt?.toISOString(),
    });
  }

  private conflictMetadata(params: {
    input: AuthIdentityInput;
    attemptedUserId?: string;
    conflictingUserId?: string;
    source?: string;
  }): Record<string, unknown> {
    return withoutUndefined({
      phase: 'phase18',
      source: params.source ?? 'identity_resolver_login',
      attemptedUserId: params.attemptedUserId,
      conflictingUserId: params.conflictingUserId,
      emailHash: params.input.email ? subjectHash(params.input.email) : undefined,
      emailPreview: params.input.email
        ? subjectPreview(AuthIdentityProvider.EMAIL, params.input.email)
        : undefined,
      emailVerified: params.input.emailVerified,
      usernamePresent: params.input.username !== undefined,
      hasTelegramId: params.input.telegramId !== undefined,
      rawProviderPayloadStored: false,
    });
  }
}
