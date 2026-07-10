import { IsOptional, Matches } from 'class-validator';

const OPAQUE_BROWSER_KEY_REGEX = /^[A-Za-z0-9_-]{32,128}$/;

export class ClaimMarketingWebTouchesDto {
  @IsOptional()
  @Matches(OPAQUE_BROWSER_KEY_REGEX, {
    message: 'visitorToken должен быть opaque URL-safe ключом',
  })
  visitorToken?: string;
}
