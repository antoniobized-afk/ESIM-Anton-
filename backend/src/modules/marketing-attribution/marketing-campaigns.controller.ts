import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import { MarketingCampaignsService } from './marketing-campaigns.service';
import { CreateMarketingCampaignDto } from './dto/create-marketing-campaign.dto';
import { MarketingCampaignsQueryDto } from './dto/marketing-campaigns-query.dto';
import { UpdateMarketingCampaignDto } from './dto/update-marketing-campaign.dto';

@ApiTags('marketing-attribution')
@ApiBearerAuth()
@Controller('marketing-attribution/campaigns')
@UseGuards(JwtAdminGuard)
export class MarketingCampaignsController {
  constructor(private readonly campaigns: MarketingCampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Создать маркетинговую кампанию и canonical links' })
  create(@Body() dto: CreateMarketingCampaignDto, @CurrentUser() actor: AuthUser) {
    return this.campaigns.createCampaign(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список маркетинговых кампаний' })
  findAll(@Query() query: MarketingCampaignsQueryDto) {
    return this.campaigns.getCampaigns(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить маркетинговую кампанию и canonical links' })
  findOne(@Param('id') id: string) {
    return this.campaigns.getCampaign(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить marketing campaign до или после запуска' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMarketingCampaignDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.campaigns.updateCampaign(id, dto, actor);
  }
}
