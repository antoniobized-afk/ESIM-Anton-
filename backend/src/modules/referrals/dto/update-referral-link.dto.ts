import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateReferralLinkDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,30}$/, {
    message: 'code должен содержать 3-30 символов: a-z, A-Z, 0-9, "_" или "-"',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  bonusPercent?: number;

  @IsOptional()
  @IsString()
  promoCodeId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}
