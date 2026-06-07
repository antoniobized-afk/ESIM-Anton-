import { IsString, MaxLength, MinLength } from 'class-validator';

export class PushSubscribeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  endpoint: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  p256dh: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  auth: string;
}

export class PushUnsubscribeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  endpoint: string;
}
