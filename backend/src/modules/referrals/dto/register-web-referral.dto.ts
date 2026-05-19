import { IsString, MinLength } from 'class-validator';

export class RegisterWebReferralDto {
  @IsString()
  @MinLength(1)
  referralCode: string;
}
