import { Prisma } from '@prisma/client';
import {
  isDailyProductDataType,
  normalizeProductDataType,
  type ProductDataType,
} from '@shared/product-data-type';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  buildProductSortKeyData,
  type ProductSortKeySource,
} from './products.sort-keys';

type ProductWriteData<T extends { dataType?: ProductDataType }> = Omit<T, 'dataType'> & {
  dataType?: ProductDataType | null;
  isUnlimited?: boolean;
};

type ProductBadgeWriteData = {
  badge?: string | null;
  badgeColor?: string | null;
};

function normalizeNullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeProductBadgeData(data: ProductBadgeWriteData): ProductBadgeWriteData {
  const badge = normalizeNullableText(data.badge);
  const badgeColor = normalizeNullableText(data.badgeColor);

  if (badge === undefined) {
    return badgeColor === undefined ? {} : { badgeColor };
  }

  return {
    badge,
    badgeColor: badge === null ? null : badgeColor ?? null,
  };
}

export function normalizeCreateProductData(
  data: ProductWriteData<CreateProductDto>,
): Prisma.EsimProductCreateInput {
  const productData = { ...data };
  delete productData.isUnlimited;

  const dataType = normalizeProductDataType(productData.dataType) ?? 1;
  const badgeData = normalizeProductBadgeData(productData);
  if (badgeData.badge === undefined && badgeData.badgeColor !== undefined) {
    badgeData.badgeColor = null;
  }

  return {
    ...productData,
    ...badgeData,
    dataType,
    isUnlimited: isDailyProductDataType(dataType),
    ...buildProductSortKeyData(productData),
  };
}

export function normalizeUpdateProductData(
  data: ProductWriteData<UpdateProductDto>,
  current?: ProductSortKeySource,
): Prisma.EsimProductUpdateInput {
  const productData = { ...data };
  delete productData.isUnlimited;
  const shouldUpdateSortKeys =
    productData.dataAmount !== undefined ||
    productData.providerPrice !== undefined ||
    productData.ourPrice !== undefined;
  const sortKeyData = shouldUpdateSortKeys
    ? buildProductSortKeyData({
        dataAmount: productData.dataAmount ?? current?.dataAmount,
        providerPrice: productData.providerPrice ?? current?.providerPrice,
        ourPrice: productData.ourPrice ?? current?.ourPrice,
      })
    : {};

  if (productData.dataType == null) {
    delete productData.dataType;
    return {
      ...productData,
      ...normalizeProductBadgeData(productData),
      ...sortKeyData,
    };
  }

  const dataType = normalizeProductDataType(productData.dataType) ?? 1;

  return {
    ...productData,
    ...normalizeProductBadgeData(productData),
    dataType,
    isUnlimited: isDailyProductDataType(dataType),
    ...sortKeyData,
  };
}
