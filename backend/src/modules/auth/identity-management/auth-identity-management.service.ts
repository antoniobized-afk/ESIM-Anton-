import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthIdentityProvider,
  Prisma,
  UserIdentityAuditActorType,
} from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OAuthProfile, OAuthService } from '../oauth.service';
import {
  normalizeEmail,
  normalizeProviderSubject,
} from '../identity/auth-identity-normalizer';
import {
  AuthIdentityConflictException,
  isAuthIdentityConflictException,
} from '../identity/auth-identity-conflict.exception';
import { AuthIdentityAuditService } from '../identity-resolver/auth-identity-audit.service';
import { AuthIdentityInput } from '../identity-resolver/auth-identity-resolver.types';
import { OAuthIdentityProfileMapper } from '../identity-resolver/oauth-identity-profile.mapper';
import { AuthIdentityLinkStateService } from './auth-identity-link-state.service';
import {
  OAuthLinkCallbackResult,
  OAuthIdentityLinkProvider,
  isOAuthIdentityLinkProvider,
  USER_FACING_IDENTITY_PROVIDERS,
  UserIdentitiesResponse,
  UserIdentityView,
} from './auth-identity-management.types';

const USER_LINK_SELECT = {
  id: true,
  isBlocked: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthIdentityManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauthService: OAuthService,
    private readonly linkStateService: AuthIdentityLinkStateService,
    private readonly profileMapper: OAuthIdentityProfileMapper,
    private readonly auditService: AuthIdentityAuditService,
  ) {}

  async listForUser(userId: string): Promise<UserIdentitiesResponse> {
    const identities = await this.prisma.userIdentity.findMany({
      where: { userId },
      orderBy: [{ provider: 'asc' }, { linkedAt: 'asc' }],
    });

    return {
      identities: identities.map((identity) =>
        this.toIdentityView(identity, identities.length),
      ),
      availableProviders: [...USER_FACING_IDENTITY_PROVIDERS],
    };
  }

  async startOAuthLink(params: {
    userId: string;
    provider: string;
    redirectUri: string;
    returnTo?: string;
  }): Promise<{ url: string }> {
    const provider = this.assertOAuthLinkProvider(params.provider);
    const state = this.linkStateService.sign({
      provider,
      userId: params.userId,
      returnTo: params.returnTo,
    });
    const url =
      provider === 'google'
        ? this.oauthService.getGoogleRedirectUrl(params.redirectUri)
        : this.oauthService.getYandexRedirectUrl(params.redirectUri);

    return { url: `${url}&state=${encodeURIComponent(state)}` };
  }

  async handleOAuthLinkCallback(
    profile: OAuthProfile,
    state?: string | null,
  ): Promise<OAuthLinkCallbackResult | null> {
    const payload = this.linkStateService.verify(state);
    if (!payload) {
      if (this.linkStateService.isLinkStateShape(state)) {
        throw new UnauthorizedException({
          code: 'OAUTH_LINK_STATE_INVALID',
          message: 'OAuth link state is invalid or expired.',
        });
      }
      return null;
    }

    if (payload.provider !== profile.provider) {
      throw new ConflictException({
        code: 'OAUTH_LINK_STATE_PROVIDER_MISMATCH',
        message: 'OAuth link state does not match provider callback.',
      });
    }

    const input = this.profileMapper.map(profile);
    const status = await this.linkIdentityToUser(
      payload.userId,
      input,
      'explicit_oauth_link',
    );

    return { handled: true, returnTo: payload.returnTo, status };
  }

  isOAuthLinkState(state?: string | null): boolean {
    return this.linkStateService.isLinkStateShape(state);
  }

  async linkEmail(userId: string, email: string): Promise<{ status: 'linked' | 'already_linked' }> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new BadRequestException('email required');

    const input: AuthIdentityInput = {
      provider: AuthIdentityProvider.EMAIL,
      providerSubject: normalizedEmail,
      email: normalizedEmail,
      emailVerified: true,
    };

    const status = await this.linkIdentityToUser(userId, input, 'explicit_email_link');
    return { status };
  }

  async linkTelegramProfile(
    userId: string,
    profile: OAuthProfile,
  ): Promise<{ status: 'linked' | 'already_linked' }> {
    if (profile.provider !== 'telegram') {
      throw new BadRequestException('telegram profile required');
    }

    const status = await this.linkIdentityToUser(
      userId,
      this.profileMapper.map(profile),
      'explicit_telegram_link',
    );
    return { status };
  }

  async unlinkIdentity(userId: string, identityId: string): Promise<{ success: true }> {
    await this.prisma.$transaction(async (tx) => {
      const identity = await tx.userIdentity.findUnique({ where: { id: identityId } });
      if (!identity) throw new NotFoundException('Identity not found');
      if (identity.userId !== userId) {
        throw new ForbiddenException('Identity belongs to another user');
      }

      const identityCount = await tx.userIdentity.count({ where: { userId } });
      if (identityCount <= 1) {
        throw new ConflictException({
          code: 'LAST_IDENTITY_UNLINK_FORBIDDEN',
          message: 'Нельзя удалить последний способ входа.',
        });
      }

      await this.auditService.recordUnlinked(tx, {
        identity,
        actorId: userId,
        reason: 'explicit_user_unlink',
      });
      await tx.userIdentity.delete({ where: { id: identityId } });
    });

    return { success: true };
  }

  private async linkIdentityToUser(
    userId: string,
    input: AuthIdentityInput,
    reason: string,
  ): Promise<'linked' | 'already_linked'> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: USER_LINK_SELECT,
        });
        if (!user) throw new UnauthorizedException('User not found');
        if (user.isBlocked) throw new ForbiddenException('Аккаунт заблокирован');

        await this.assertNoEmailCollision(tx, userId, input);
        await this.assertNoTelegramContactCollision(tx, userId, input);

        const existing = await tx.userIdentity.findUnique({
          where: {
            provider_providerSubject: {
              provider: input.provider,
              providerSubject: input.providerSubject,
            },
          },
          select: { id: true, userId: true },
        });

        if (existing) {
          if (existing.userId !== userId) {
            throw this.providerAlreadyLinked(input, {
              attemptedUserId: userId,
              conflictingUserId: existing.userId,
            });
          }
          await tx.userIdentity.update({
            where: { id: existing.id },
            data: { lastLoginAt: new Date() },
          });
          return 'already_linked';
        }

        const existingProvider = await tx.userIdentity.findFirst({
          where: { userId, provider: input.provider },
          select: { id: true },
        });
        if (existingProvider) {
          throw this.providerAlreadyLinkedToUser(input, { attemptedUserId: userId });
        }

        const identity = await this.createIdentityOrThrowConflict(tx, userId, input);
        await this.auditService.recordLinked(tx, {
          identityId: identity.id,
          userId,
          input,
          reason,
          actorType: UserIdentityAuditActorType.USER,
          actorId: userId,
          source: 'identity_management_explicit_link',
        });
        return 'linked';
      });
    } catch (error) {
      await this.recordLinkConflictFromError(error, {
        userId,
        input,
      });
      throw error;
    }
  }

  private async assertNoEmailCollision(
    tx: Prisma.TransactionClient,
    userId: string,
    input: AuthIdentityInput,
  ): Promise<void> {
    if (input.provider !== AuthIdentityProvider.EMAIL) return;
    if (!input.email) return;

    const [existingEmailUser, existingEmailIdentity] = await Promise.all([
      tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      }),
      tx.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthIdentityProvider.EMAIL,
            providerSubject: input.email,
          },
        },
        select: { userId: true },
      }),
    ]);

    const conflictingOwnerId = [existingEmailUser?.id, existingEmailIdentity?.userId]
      .find((ownerId) => ownerId !== undefined && ownerId !== userId);
    if (!conflictingOwnerId) return;

    throw new AuthIdentityConflictException({
      code: 'EMAIL_ALREADY_USED_BY_ANOTHER_ACCOUNT',
      message: 'Этот email уже привязан к другому аккаунту.',
      provider: input.provider,
    }, {
      code: 'EMAIL_ALREADY_USED_BY_ANOTHER_ACCOUNT',
      userId,
      attemptedUserId: userId,
      conflictingUserId: conflictingOwnerId,
    });
  }

  private async assertNoTelegramContactCollision(
    tx: Prisma.TransactionClient,
    userId: string,
    input: AuthIdentityInput,
  ): Promise<void> {
    if (input.provider !== AuthIdentityProvider.TELEGRAM || input.telegramId === undefined) {
      return;
    }

    const contactOwner = await tx.user.findUnique({
      where: { telegramId: input.telegramId },
      select: { id: true },
    });
    if (!contactOwner || contactOwner.id === userId) return;

    throw new AuthIdentityConflictException({
      code: 'TELEGRAM_CONTACT_ALREADY_USED_BY_ANOTHER_ACCOUNT',
      message: 'Этот Telegram уже привязан к другому аккаунту.',
      provider: input.provider,
    }, {
      code: 'TELEGRAM_CONTACT_ALREADY_USED_BY_ANOTHER_ACCOUNT',
      userId,
      attemptedUserId: userId,
      conflictingUserId: contactOwner.id,
    });
  }

  private async createIdentityOrThrowConflict(
    tx: Prisma.TransactionClient,
    userId: string,
    input: AuthIdentityInput,
  ): Promise<{ id: string }> {
    try {
      return await tx.userIdentity.create({
        data: this.identityCreateData(userId, input),
        select: { id: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw this.providerAlreadyLinked(input, { attemptedUserId: userId });
      }
      throw error;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private identityCreateData(
    userId: string,
    input: AuthIdentityInput,
  ): Prisma.UserIdentityCreateInput {
    return {
      user: { connect: { id: userId } },
      provider: input.provider,
      providerSubject: normalizeProviderSubject(input.provider, input.providerSubject),
      email: input.email,
      emailVerified: input.emailVerified,
      displayName: this.displayName(input),
      linkedAt: new Date(),
      lastLoginAt: new Date(),
      metadata: {
        phase: 'phase18',
        source: 'identity_management_explicit_link',
      },
    };
  }

  private toIdentityView(
    identity: {
      id: string;
      provider: AuthIdentityProvider;
      email: string | null;
      emailVerified: boolean;
      displayName: string | null;
      linkedAt: Date;
      lastLoginAt: Date | null;
    },
    identityCount: number,
  ): UserIdentityView {
    return {
      id: identity.id,
      provider: identity.provider,
      label: this.providerLabel(identity.provider),
      email: identity.email,
      emailVerified: identity.emailVerified,
      displayName: identity.displayName,
      linkedAt: identity.linkedAt,
      lastLoginAt: identity.lastLoginAt,
      canUnlink: identityCount > 1,
    };
  }

  private providerLabel(provider: AuthIdentityProvider): string {
    const labels: Record<AuthIdentityProvider, string> = {
      [AuthIdentityProvider.EMAIL]: 'Email',
      [AuthIdentityProvider.TELEGRAM]: 'Telegram',
      [AuthIdentityProvider.GOOGLE]: 'Google',
      [AuthIdentityProvider.YANDEX]: 'Яндекс',
      [AuthIdentityProvider.VK]: 'VK',
    };
    return labels[provider];
  }

  private assertOAuthLinkProvider(provider: string): OAuthIdentityLinkProvider {
    if (isOAuthIdentityLinkProvider(provider)) return provider;
    throw new BadRequestException('Unsupported OAuth link provider');
  }

  private displayName(input: AuthIdentityInput): string | undefined {
    const fullName = [input.firstName, input.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || input.username?.trim() || undefined;
  }

  private async recordLinkConflictFromError(
    error: unknown,
    params: {
      userId: string;
      input: AuthIdentityInput;
    },
  ): Promise<void> {
    if (!isAuthIdentityConflictException(error)) return;

    await this.auditService.recordLoginConflict(this.prisma, {
      input: params.input,
      userId: error.auditContext.userId ?? params.userId,
      actorType: UserIdentityAuditActorType.USER,
      actorId: params.userId,
      attemptedUserId: error.auditContext.attemptedUserId ?? params.userId,
      conflictingUserId: error.auditContext.conflictingUserId,
      reason: error.auditContext.code,
      source: 'identity_management_explicit_link',
    });
  }

  private providerAlreadyLinked(
    input: AuthIdentityInput,
    context: { attemptedUserId?: string; conflictingUserId?: string } = {},
  ): ConflictException {
    return new AuthIdentityConflictException({
      code: 'PROVIDER_IDENTITY_ALREADY_LINKED',
      message: 'Этот способ входа уже привязан к другому аккаунту.',
      provider: input.provider,
    }, {
      code: 'PROVIDER_IDENTITY_ALREADY_LINKED',
      attemptedUserId: context.attemptedUserId,
      conflictingUserId: context.conflictingUserId,
    });
  }

  private providerAlreadyLinkedToUser(
    input: AuthIdentityInput,
    context: { attemptedUserId?: string } = {},
  ): ConflictException {
    return new AuthIdentityConflictException({
      code: 'PROVIDER_ALREADY_LINKED_TO_USER',
      message: 'Этот провайдер уже привязан к аккаунту. Сначала отвяжите текущий способ входа.',
      provider: input.provider,
    }, {
      code: 'PROVIDER_ALREADY_LINKED_TO_USER',
      userId: context.attemptedUserId,
      attemptedUserId: context.attemptedUserId,
    });
  }
}
