import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthCallbackUrlService } from './auth-callback-url.service';
import { AuthIdentityController } from './auth-identity.controller';
import { EmailCodeService } from './email-code.service';
import { OAuthService } from './oauth.service';
import { UserIdentityBackfillApplier } from './identity-backfill/user-identity-backfill-applier.service';
import { UserIdentityBackfillService } from './identity-backfill/user-identity-backfill.service';
import { UserIdentityCandidateBuilder } from './identity-backfill/user-identity-candidate-builder.service';
import { UserIdentityPreflightService } from './identity-backfill/user-identity-preflight.service';
import { AuthIdentityAuditService } from './identity-resolver/auth-identity-audit.service';
import { AuthIdentityResolverService } from './identity-resolver/auth-identity-resolver.service';
import { OAuthIdentityProfileMapper } from './identity-resolver/oauth-identity-profile.mapper';
import { AuthIdentityLinkStateService } from './identity-management/auth-identity-link-state.service';
import { AuthIdentityManagementService } from './identity-management/auth-identity-management.service';
import { MarketingAttributionModule } from '../marketing-attribution/marketing-attribution.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [
    ConfigModule,
    MarketingAttributionModule,
    ReferralsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      }),
    }),
  ],
  controllers: [AuthController, AuthIdentityController],
  providers: [
    AuthService,
    AuthCallbackUrlService,
    EmailCodeService,
    OAuthService,
    UserIdentityCandidateBuilder,
    UserIdentityPreflightService,
    UserIdentityBackfillApplier,
    UserIdentityBackfillService,
    OAuthIdentityProfileMapper,
    AuthIdentityAuditService,
    AuthIdentityResolverService,
    AuthIdentityLinkStateService,
    AuthIdentityManagementService,
  ],
  exports: [
    AuthService,
    EmailCodeService,
    OAuthService,
    AuthCallbackUrlService,
    UserIdentityBackfillService,
    AuthIdentityResolverService,
    AuthIdentityManagementService,
  ],
})
export class AuthModule {}
