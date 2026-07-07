import { Transform } from 'class-transformer';
import { IsBoolean, IsIn } from 'class-validator';
import {
  DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE,
  PRODUCT_DATA_TYPES,
  normalizeProductDataTypeSelector,
  type ProductDataTypeSelector,
} from '@shared/product-data-type';

const PRODUCT_DATA_TYPE_SELECTORS = [
  ...PRODUCT_DATA_TYPES,
  DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE,
] as const;

export class BulkToggleByDataTypeDto {
  @Transform(({ value }) => normalizeProductDataTypeSelector(value) ?? value)
  @IsIn(PRODUCT_DATA_TYPE_SELECTORS, {
    message: 'dataType должен быть одним из значений: 1, 2, 3, 4 или daily',
  })
  dataType: ProductDataTypeSelector;

  @IsBoolean()
  isActive: boolean;
}
