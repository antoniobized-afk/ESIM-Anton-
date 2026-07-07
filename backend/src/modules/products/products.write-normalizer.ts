import { Prisma } from '@prisma/client';
import {
  isDailyProductDataType,
  normalizeProductDataType,
  type ProductDataType,
} from '@shared/product-data-type';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type ProductWriteData<T extends { dataType?: ProductDataType }> = Omit<T, 'dataType'> & {
  dataType?: ProductDataType | null;
  isUnlimited?: boolean;
};

export function normalizeCreateProductData(
  data: ProductWriteData<CreateProductDto>,
): Prisma.EsimProductCreateInput {
  const productData = { ...data };
  delete productData.isUnlimited;

  const dataType = normalizeProductDataType(productData.dataType) ?? 1;

  return {
    ...productData,
    dataType,
    isUnlimited: isDailyProductDataType(dataType),
  };
}

export function normalizeUpdateProductData(
  data: ProductWriteData<UpdateProductDto>,
): Prisma.EsimProductUpdateInput {
  const productData = { ...data };
  delete productData.isUnlimited;

  if (productData.dataType == null) {
    delete productData.dataType;
    return productData;
  }

  const dataType = normalizeProductDataType(productData.dataType) ?? 1;

  return {
    ...productData,
    dataType,
    isUnlimited: isDailyProductDataType(dataType),
  };
}
