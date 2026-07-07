import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PRODUCT_DATA_TYPES, normalizeProductDataType, type ProductDataType } from '@shared/product-data-type';

export class CreateProductDto {
  @IsString()
  @MaxLength(128)
  country: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  region?: string | null;

  @IsString()
  @MaxLength(256)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  description?: string | null;

  @IsString()
  @MaxLength(64)
  dataAmount: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  validityDays: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number | null;

  @Transform(({ value }) => normalizeProductDataType(value) ?? value)
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @IsIn(PRODUCT_DATA_TYPES, {
    message: 'dataType должен быть одним из значений: 1, 2, 3, 4',
  })
  dataType?: ProductDataType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  speed?: string | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  providerPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ourPrice: number;

  @IsString()
  @MaxLength(256)
  providerId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  providerName?: string;

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  badge?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  badgeColor?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  supportTopup?: boolean;
}
