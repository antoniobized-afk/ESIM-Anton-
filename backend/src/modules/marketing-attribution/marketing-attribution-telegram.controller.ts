import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ServiceTokenGuard } from '@/common/auth/service-token.guard';
import { CaptureMarketingTelegramBotTouchDto } from './dto/capture-marketing-telegram-bot-touch.dto';
import { MarketingAttributionTelegramService } from './marketing-attribution-telegram.service';

@ApiTags('marketing-attribution')
@Controller('marketing-attribution/telegram')
export class MarketingAttributionTelegramController {
  constructor(private readonly telegramAttribution: MarketingAttributionTelegramService) {}

  @Post('bot/capture')
  @UseGuards(ServiceTokenGuard)
  @SkipThrottle()
  @ApiOperation({ summary: 'Принять trusted Telegram bot marketing touch' })
  captureBotTouch(@Body() dto: CaptureMarketingTelegramBotTouchDto) {
    return this.telegramAttribution.captureBotTouch(dto);
  }
}
