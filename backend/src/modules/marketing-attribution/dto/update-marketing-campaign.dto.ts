import { IsBoolean, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class UpdateMarketingCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmContent?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmTerm?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^\/(?!\/)[^\s\\]*$/, {
    message: 'targetPath должен быть относительным путём приложения, начинающимся с /',
  })
  targetPath?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'referralLinkId должен быть непустым идентификатором' })
  referralLinkId?: string | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
