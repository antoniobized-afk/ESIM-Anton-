import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthIdentityProvider } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { OAuthProfile } from './oauth.service';
import { AuthIdentityResolverService } from './identity-resolver/auth-identity-resolver.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly identityResolver: AuthIdentityResolverService,
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
    const login = await this.identityResolver.resolveEmailLogin(email);
    return this.generateUserToken(login.user, login.provider);
  }

  /**
   * Найти или создать пользователя через OAuth
   */
  async loginWithOAuth(profile: OAuthProfile) {
    const login = await this.identityResolver.resolveOAuthLogin(profile);
    return this.generateUserToken(login.user, login.provider);
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
      id: user.id,
      telegramId: user.telegramId ? user.telegramId.toString() : null,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email,
      balance: Number(user.balance),
      bonusBalance: Number(user.bonusBalance),
      referralCode: user.referralCode,
      referredById: user.referredById,
      referralLinkId: user.referralLinkId,
      totalSpent: Number(user.totalSpent),
      isBlocked: user.isBlocked,
      createdAt: user.createdAt,
    };
  }

  private generateUserToken(
    user: { id: string },
    provider: AuthIdentityProvider,
  ) {
    const payload = { sub: user.id, type: 'user', provider: provider.toLowerCase() };
    const access_token = this.jwtService.sign(payload, { expiresIn: '30d' });
    return { access_token, userId: user.id };
  }
}
