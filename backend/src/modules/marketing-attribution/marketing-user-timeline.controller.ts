import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import { MarketingUserTimelineQueryDto } from './dto/marketing-user-timeline-query.dto';
import { MarketingUserTimelineService } from './marketing-user-timeline.service';

@ApiTags('marketing-attribution')
@ApiBearerAuth()
@Controller('marketing-attribution/users')
@UseGuards(JwtAdminGuard)
export class MarketingUserTimelineController {
  constructor(private readonly timeline: MarketingUserTimelineService) {}

  @Get(':userId/timeline')
  @ApiOperation({ summary: 'Получить marketing timeline пользователя для admin/support' })
  getUserTimeline(
    @Param('userId') userId: string,
    @Query() query: MarketingUserTimelineQueryDto,
  ) {
    return this.timeline.getUserTimeline(userId, query);
  }
}
