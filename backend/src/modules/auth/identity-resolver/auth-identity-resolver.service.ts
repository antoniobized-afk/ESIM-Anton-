import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthIdentityProvider, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OAuthProfile } from '../oauth.service';
import {
  normalizeEmail,
  normalizeProviderSubject,
  providerToLegacyValue,
} from '../identity/auth-identity-normalizer';
import {
  AuthIdentityConflictException,
  isAuthIdentityConflictException,
} from '../identity/auth-identity-conflict.exception';
import { AuthIdentityAuditService } from './auth-identity-audit.service';
import {
  AuthIdentityInput,
  AuthIdentityLoginResult,
  AuthIdentityLoginUser,
  TelegramBotIdentityInput,
} from './auth-identity-resolver.types';
import { OAuthIdentityProfileMapper } from './oauth-identity-profile.mapper';

const LOGIN_USER_SELECT = {
  id: true,
  authProvider: true,
  isBlocked: true,
  telegramId: true,
} satisfies Prisma.UserSelect;

const BOT_USER_INCLUDE = {
  loyaltyLevel: true,
  referredBy: true,
} satisfies Prisma.UserInclude;

@Injectable()
export class AuthIdentityResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileMapper: OAuthIdentityProfileMapper,
    private readonly auditService: AuthIdentityAuditService,
  ) {}

  async resolveEmailLogin(email: string): Promise<AuthIdentityLoginResult> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new UnauthorizedException('Email is required');

    const input: AuthIdentityInput = {
      provider: AuthIdentityProvider.EMAIL,
      providerSubject: normalizedEmail,
      email: normalizedEmail,
      emailVerified: true,
      firstName: 'Пользователь',
    };

    return this.resolveEmailIdentity(input);
  }

  async resolveOAuthLogin(profile: OAuthProfile): Promise<AuthIdentityLoginResult> {
    const input = this.profileMapper.map(profile);
    const existingIdentity = await this.findIdentityLogin(input);
    if (existingIdentity) return existingIdentity;

    const legacyUser = await this.findLegacyExactUser(input);
    if (legacyUser) {
      return this.linkIdentityToExistingUser(
        legacyUser,
        input,
        'login_legacy_exact_provider_continuity',
      );
    }

    await this.assertNoOAuthEmailCollision(input);
    return this.createUserWithIdentity(input, 'login_new_oauth_user');
  }

  async resolveTelegramBotUser(input: TelegramBotIdentityInput) {
    const identityInput = this.telegramBotIdentityInput(input);
    const existingIdentity = await this.prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: identityInput.provider,
          providerSubject: identityInput.providerSubject,
        },
      },
      include: { user: { include: BOT_USER_INCLUDE } },
    });

    if (existingIdentity) {
      this.assertCanLogin(existingIdentity.user);
      await this.prisma.userIdentity.update({
        where: { id: existingIdentity.id },
        data: { lastLoginAt: new Date() },
      });
      return existingIdentity.user;
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { telegramId: input.telegramId },
      include: BOT_USER_INCLUDE,
    });

    if (existingUser) {
      this.assertCanLogin(existingUser);
      await this.linkIdentityToExistingUser(
        {
          id: existingUser.id,
          authProvider: existingUser.authProvider,
          isBlocked: existingUser.isBlocked,
        },
        identityInput,
        'bot_telegram_existing_user',
      );
      return existingUser;
    }

    return this.createTelegramBotUser(input, identityInput);
  }

  private async resolveEmailIdentity(
    input: AuthIdentityInput,
  ): Promise<AuthIdentityLoginResult> {
    const existingIdentity = await this.findIdentityLogin(input);
    if (existingIdentity) return existingIdentity;

    const existingUser = await this.findLegacyEmailUser(input);

    if (existingUser) {
      return this.linkIdentityToExistingUser(existingUser, input, 'email_login_existing_user');
    }

    return this.createUserWithIdentity(input, 'login_new_email_user');
  }

  private async findLegacyEmailUser(
    input: AuthIdentityInput,
  ): Promise<AuthIdentityLoginUser | null> {
    const exact = await this.prisma.user.findUnique({
      where: { email: input.providerSubject },
      select: LOGIN_USER_SELECT,
    });
    if (exact) return exact;

    const normalizedMatches = await this.prisma.user.findMany({
      where: {
        email: {
          equals: input.providerSubject,
          mode: 'insensitive',
        },
      },
      select: LOGIN_USER_SELECT,
      orderBy: { id: 'asc' },
      take: 2,
    });

    if (normalizedMatches.length <= 1) return normalizedMatches[0] ?? null;

    await this.auditService.recordLoginConflict(this.prisma, {
      input,
      userId: normalizedMatches[0].id,
      attemptedUserId: normalizedMatches[0].id,
      conflictingUserId: normalizedMatches[1].id,
      reason: 'email_normalized_duplicate',
      source: 'identity_resolver_login',
    });

    throw new AuthIdentityConflictException({
      code: 'EMAIL_NORMALIZED_DUPLICATE',
      message:
        'Для этого email найдено несколько аккаунтов. Обратитесь в поддержку для проверки.',
      provider: input.provider,
    }, {
      code: 'EMAIL_NORMALIZED_DUPLICATE',
      userId: normalizedMatches[0].id,
      attemptedUserId: normalizedMatches[0].id,
      conflictingUserId: normalizedMatches[1].id,
    });
  }

  private async findIdentityLogin(
    input: AuthIdentityInput,
  ): Promise<AuthIdentityLoginResult | null> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: input.provider,
          providerSubject: input.providerSubject,
        },
      },
      include: { user: { select: LOGIN_USER_SELECT } },
    });

    if (!identity) return null;

    this.assertCanLogin(identity.user);
    try {
      await this.assertNoTelegramContactCollision(this.prisma, identity.userId, input);
      this.assertTelegramContactMatchesUser(identity.user, input);
    } catch (error) {
      await this.recordLoginConflictFromError(error, {
        input,
        userId: identity.userId,
      });
      throw error;
    }

    await this.prisma.userIdentity.update({
      where: { id: identity.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: identity.user, provider: input.provider };
  }

  private async findLegacyExactUser(
    input: AuthIdentityInput,
  ): Promise<AuthIdentityLoginUser | null> {
    if (input.provider === AuthIdentityProvider.TELEGRAM && input.telegramId !== undefined) {
      const telegramUser = await this.prisma.user.findUnique({
        where: { telegramId: input.telegramId },
        select: LOGIN_USER_SELECT,
      });
      if (telegramUser) return telegramUser;
    }

    return this.prisma.user.findFirst({
      where: {
        authProvider: providerToLegacyValue(input.provider),
        providerId: input.providerSubject,
      },
      select: LOGIN_USER_SELECT,
    });
  }

  private async assertNoOAuthEmailCollision(input: AuthIdentityInput): Promise<void> {
    if (!input.email) return;

    const [existingEmailUser, existingEmailIdentity] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      }),
      this.prisma.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthIdentityProvider.EMAIL,
            providerSubject: input.email,
          },
        },
        select: { userId: true },
      }),
    ]);

    const ownerUserId = existingEmailUser?.id ?? existingEmailIdentity?.userId;
    if (!ownerUserId) return;

    await this.auditService.recordLoginConflict(this.prisma, {
      input,
      userId: ownerUserId,
      conflictingUserId: ownerUserId,
      reason: 'oauth_email_already_used',
      source: 'identity_resolver_login',
    });

    throw new AuthIdentityConflictException({
      code: 'OAUTH_EMAIL_ALREADY_USED',
      message:
        'Этот email уже привязан к другому аккаунту. Войдите через email и привяжите провайдера явно.',
      provider: input.provider,
    }, {
      code: 'OAUTH_EMAIL_ALREADY_USED',
      userId: ownerUserId,
      conflictingUserId: ownerUserId,
    });
  }

  private async linkIdentityToExistingUser(
    user: AuthIdentityLoginUser,
    input: AuthIdentityInput,
    reason: string,
  ): Promise<AuthIdentityLoginResult> {
    this.assertCanLogin(user);

    try {
      await this.prisma.$transaction(async (tx) => {
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
          if (existing.userId !== user.id) {
            throw this.providerAlreadyLinked(input, {
              attemptedUserId: user.id,
              conflictingUserId: existing.userId,
            });
          }
          await tx.userIdentity.update({
            where: { id: existing.id },
            data: { lastLoginAt: new Date() },
          });
          return;
        }

        const existingProvider = await tx.userIdentity.findFirst({
          where: { userId: user.id, provider: input.provider },
          select: { id: true },
        });
        if (existingProvider) {
          throw this.providerAlreadyLinkedToUser(input, { attemptedUserId: user.id });
        }

        await this.assertNoTelegramContactCollision(tx, user.id, input);

        const identity = await this.createIdentityOrThrowConflict(tx, user.id, input);
        await this.auditService.recordLinked(tx, {
          identityId: identity.id,
          userId: user.id,
          input,
          reason,
        });
      });
    } catch (error) {
      await this.recordLoginConflictFromError(error, {
        input,
        userId: user.id,
      });
      throw error;
    }

    return { user, provider: input.provider };
  }

  private async createUserWithIdentity(
    input: AuthIdentityInput,
    reason: string,
  ): Promise<AuthIdentityLoginResult> {
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: this.userCreateData(input),
        select: LOGIN_USER_SELECT,
      });
      const identity = await this.createIdentityOrThrowConflict(tx, createdUser.id, input);
      await this.auditService.recordLinked(tx, {
        identityId: identity.id,
        userId: createdUser.id,
        input,
        reason,
      });
      return createdUser;
    });

    return { user, provider: input.provider };
  }

  private async createTelegramBotUser(
    botInput: TelegramBotIdentityInput,
    identityInput: AuthIdentityInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          telegramId: botInput.telegramId,
          username: botInput.username,
          firstName: botInput.firstName,
          lastName: botInput.lastName,
          utmSource: botInput.utmSource,
          utmMedium: botInput.utmMedium,
          utmCampaign: botInput.utmCampaign,
        },
        include: BOT_USER_INCLUDE,
      });
      const identity = await this.createIdentityOrThrowConflict(tx, user.id, identityInput);
      await this.auditService.recordLinked(tx, {
        identityId: identity.id,
        userId: user.id,
        input: identityInput,
        reason: 'bot_telegram_new_user',
      });
      return user;
    });
  }

  private userCreateData(input: AuthIdentityInput): Prisma.UserCreateInput {
    return {
      email: input.email,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      authProvider: providerToLegacyValue(input.provider),
      providerId: input.providerSubject,
      ...(input.telegramId !== undefined ? { telegramId: input.telegramId } : {}),
    };
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
      lastLoginAt: new Date(),
      metadata: {
        phase: 'phase18',
        source: 'identity_resolver_login',
      },
    };
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

  private telegramBotIdentityInput(input: TelegramBotIdentityInput): AuthIdentityInput {
    return {
      provider: AuthIdentityProvider.TELEGRAM,
      providerSubject: input.telegramId.toString(),
      emailVerified: false,
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      telegramId: input.telegramId,
    };
  }

  private displayName(input: AuthIdentityInput): string | undefined {
    const fullName = [input.firstName, input.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || input.username?.trim() || undefined;
  }

  private assertCanLogin(user: AuthIdentityLoginUser): void {
    if (!user.isBlocked) return;
    throw new ForbiddenException('Аккаунт заблокирован');
  }

  private async assertNoTelegramContactCollision(
    client: Pick<Prisma.TransactionClient, 'user'>,
    userId: string,
    input: AuthIdentityInput,
  ): Promise<void> {
    if (input.provider !== AuthIdentityProvider.TELEGRAM || input.telegramId === undefined) {
      return;
    }

    const contactOwner = await client.user.findUnique({
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

  private assertTelegramContactMatchesUser(
    user: AuthIdentityLoginUser,
    input: AuthIdentityInput,
  ): void {
    if (
      input.provider !== AuthIdentityProvider.TELEGRAM ||
      input.telegramId === undefined ||
      user.telegramId === undefined ||
      user.telegramId === null ||
      user.telegramId === input.telegramId
    ) {
      return;
    }

    throw new AuthIdentityConflictException({
      code: 'TELEGRAM_IDENTITY_CONTACT_DRIFT',
      message: 'Telegram identity не совпадает с Telegram contact аккаунта.',
      provider: input.provider,
    }, {
      code: 'TELEGRAM_IDENTITY_CONTACT_DRIFT',
      userId: user.id,
      attemptedUserId: user.id,
    });
  }

  private async recordLoginConflictFromError(
    error: unknown,
    params: {
      input: AuthIdentityInput;
      userId: string;
    },
  ): Promise<void> {
    if (!isAuthIdentityConflictException(error)) return;

    await this.auditService.recordLoginConflict(this.prisma, {
      input: params.input,
      userId: error.auditContext.userId ?? params.userId,
      attemptedUserId: error.auditContext.attemptedUserId ?? params.userId,
      conflictingUserId: error.auditContext.conflictingUserId,
      reason: error.auditContext.code,
      source: 'identity_resolver_login',
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
      message: 'Этот провайдер уже привязан к аккаунту.',
      provider: input.provider,
    }, {
      code: 'PROVIDER_ALREADY_LINKED_TO_USER',
      userId: context.attemptedUserId,
      attemptedUserId: context.attemptedUserId,
    });
  }
}
