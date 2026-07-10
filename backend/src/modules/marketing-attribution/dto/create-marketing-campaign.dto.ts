import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateMarketingCampaignDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(160)
  utmSource: string;

  @IsString()
  @MaxLength(160)
  utmMedium: string;

  @IsString()
  @MaxLength(160)
  utmCampaign: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmTerm?: string;

  @IsString()
  @MaxLength(512)
  @Matches(/^\/(?!\/)[^\s\\]*$/, {
    message: 'targetPath должен быть относительным путём приложения, начинающимся с /',
  })
  targetPath: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'referralLinkId должен быть непустым идентификатором' })
  referralLinkId?: string | null;
}
