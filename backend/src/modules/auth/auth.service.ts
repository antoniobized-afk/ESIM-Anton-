import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { OAuthProfile } from './oauth.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  /**
   * Логин администратора
   */
  async loginAdmin(email: string, password: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { email },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // Обновляем время последнего входа
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
    };

    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '24h' }),
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      },
    };
  }

  /**
   * Создать администратора
   */
  async createAdmin(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    role?: 'SUPER_ADMIN' | 'MANAGER' | 'SUPPORT';
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.admin.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role || 'SUPPORT',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });
  }

  /**
   * Верификация JWT токена
   */
  async verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Невалидный токен');
    }
  }

  /**
   * Найти или создать пользователя по email (после email-кода верификации)
   */
  async loginWithEmail(email: string) {
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          authProvider: 'email',
          providerId: email,
          firstName: 'Пользователь',
        },
      });
      this.logger.log(`✅ New user created via email: ${email}`);
    }

    return this.generateUserToken(user);
  }

  /**
   * Найти или создать пользователя через OAuth
   */
  async loginWithOAuth(profile: OAuthProfile) {
    const providerId = String(profile.providerId);
    const telegramId =
      profile.provider === 'telegram' && /^\d+$/.test(providerId)
        ? BigInt(providerId)
        : null;

    // Try by providerId first
    let user = await this.prisma.user.findFirst({
      where: { authProvider: profile.provider, providerId },
    });

    // Telegram users may already exist from bot flow with unique telegramId,
    // but without authProvider/providerId linked yet.
    if (!user && telegramId !== null) {
      user = await this.prisma.user.findUnique({ where: { telegramId } });
    }

    // Try by email if provider is google/yandex
    if (!user && profile.email) {
      user = await this.prisma.user.findUnique({ where: { email: profile.email } });
    }

    if (!user) {
      try {
        user = await this.prisma.user.create({
          data: {
            authProvider: profile.provider,
            providerId,
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            username: profile.username,
            phone: profile.phone,
            ...(telegramId !== null ? { telegramId } : {}),
          },
        });
        this.logger.log(`✅ New user created via ${profile.provider}: ${providerId}`);
      } catch (error) {
        // Handle concurrent create race / pre-existing unique keys gracefully.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          if (telegramId !== null) {
            user = await this.prisma.user.findUnique({ where: { telegramId } });
          }
          if (!user) {
            user = await this.prisma.user.findFirst({
              where: { authProvider: profile.provider, providerId },
            });
          }
        }
        if (!user) throw error;
      }
    } else if (!user.authProvider) {
      // Link existing user to OAuth provider
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { authProvider: profile.provider, providerId },
      });
    }

    return this.generateUserToken(user);
  }

  /**
   * Получить текущего пользователя по JWT payload
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        authProvider: true,
        balance: true,
        bonusBalance: true,
        referralCode: true,
        referredById: true,
        referralLinkId: true,
        totalSpent: true,
        isBlocked: true,
        createdAt: true,
      },
    });

    if (!user) throw new UnauthorizedException('Пользователь не найден');

    return {
      ...user,
      telegramId: user.telegramId ? user.telegramId.toString() : null,
      balance: Number(user.balance),
      bonusBalance: Number(user.bonusBalance),
      totalSpent: Number(user.totalSpent),
    };
  }

  private generateUserToken(user: { id: string; authProvider?: string | null }) {
    const payload = { sub: user.id, type: 'user', provider: user.authProvider };
    const access_token = this.jwtService.sign(payload, { expiresIn: '30d' });
    return { access_token, userId: user.id };
  }
}
