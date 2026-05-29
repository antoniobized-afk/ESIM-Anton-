import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReferralPayoutMode } from '@prisma/client';
import { IsPartnerRewardPolicyComplete } from './promo-code-reward-policy.validator';

export class CreatePromoCodeDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,30}$/, {
    message: 'code должен содержать 3-30 символов: a-z, A-Z, 0-9, "_" или "-"',
  })
  code: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  referralOwnerId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  referralBonusPercent?: number | null;

  @IsOptional()
  @IsEnum(ReferralPayoutMode, {
    message: 'referralPayoutMode должен быть BALANCE или EXTERNAL',
  })
  referralPayoutMode?: ReferralPayoutMode | null;

  @IsPartnerRewardPolicyComplete()
  private readonly partnerRewardPolicyComplete?: boolean;
}
