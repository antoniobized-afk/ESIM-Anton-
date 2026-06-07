import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SendEmailAuthCodeDto {
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class VerifyEmailAuthCodeDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class TelegramWebAppAuthDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  initData: string;
}
