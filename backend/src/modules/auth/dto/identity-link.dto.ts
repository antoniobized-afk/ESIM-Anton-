import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class StartOAuthIdentityLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^\/(?!\/)/)
  returnTo?: string;
}

export class SendEmailIdentityLinkCodeDto {
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class VerifyEmailIdentityLinkDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class TelegramWebAppIdentityLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  initData: string;
}
