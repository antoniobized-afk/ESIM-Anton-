import { Matches } from 'class-validator';
import { MARKETING_CAMPAIGN_CODE_REGEX } from '../marketing-attribution.types';

const OPAQUE_BROWSER_KEY_REGEX = /^[A-Za-z0-9_-]{32,128}$/;

export class CaptureMarketingWebTouchDto {
  @Matches(MARKETING_CAMPAIGN_CODE_REGEX, {
    message: 'campaignCode содержит недопустимые символы',
  })
  campaignCode!: string;

  @Matches(OPAQUE_BROWSER_KEY_REGEX, {
    message: 'visitorToken должен быть opaque URL-safe ключом',
  })
  visitorToken!: string;

  @Matches(OPAQUE_BROWSER_KEY_REGEX, {
    message: 'launchKey должен быть opaque URL-safe ключом',
  })
  launchKey!: string;
}
