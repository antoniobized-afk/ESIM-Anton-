import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { CaptureMarketingWebTouchDto } from './dto/capture-marketing-web-touch.dto';
import { ClaimMarketingWebTouchesDto } from './dto/claim-marketing-web-touches.dto';
import { MarketingAttributionWebService } from './marketing-attribution-web.service';

@ApiTags('marketing-attribution')
@Controller('marketing-attribution/web')
export class MarketingAttributionWebController {
  constructor(private readonly webAttribution: MarketingAttributionWebService) {}

  @Post('capture')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Принять bounded anonymous web marketing touch' })
  capture(@Body() dto: CaptureMarketingWebTouchDto) {
    return this.webAttribution.captureWebTouch(dto);
  }

  @Post('claim')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Привязать pending web touches к текущему пользователю' })
  claim(@Body() dto: ClaimMarketingWebTouchesDto, @CurrentUser() user: AuthUser) {
    return this.webAttribution.claimWebTouches(user.id, dto);
  }
}
