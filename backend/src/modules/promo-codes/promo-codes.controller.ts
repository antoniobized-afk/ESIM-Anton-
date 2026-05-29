import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PromoCodesService } from './promo-codes.service';
import { JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';

@ApiTags('promo-codes')
@Controller('promo-codes')
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Get()
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Все промокоды (для админки)' })
  async findAll() {
    return this.promoCodesService.findAll();
  }

  @Post()
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Создать промокод' })
  async create(@Body() dto: CreatePromoCodeDto) {
    return this.promoCodesService.create(dto);
  }

  @Get('validate')
  @ApiOperation({ summary: 'Проверить промокод (для фронта)' })
  async validate(@Query('code') code: string) {
    return this.promoCodesService.validate(code);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Включить/выключить промокод' })
  async toggle(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.promoCodesService.toggleActive(id, body.isActive);
  }

  @Patch(':id')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Обновить промокод' })
  async update(@Param('id') id: string, @Body() dto: UpdatePromoCodeDto) {
    return this.promoCodesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Удалить промокод' })
  async delete(@Param('id') id: string) {
    return this.promoCodesService.delete(id);
  }
}
