import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata, Type } from '@nestjs/common';
import { BulkToggleByDataTypeDto } from './bulk-toggle-by-data-type.dto';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const baseCreatePayload = {
  country: 'TH',
  name: 'Thailand 1GB',
  dataAmount: '1 GB',
  validityDays: 7,
  providerPrice: 10000,
  ourPrice: 150,
  providerId: 'TH_1GB_7D',
  isActive: true,
};

function bodyMetadata<T>(metatype: Type<T>): ArgumentMetadata {
  return {
    type: 'body',
    metatype,
    data: undefined,
  };
}

async function transformBody<T extends object>(
  metatype: Type<T>,
  body: Record<string, unknown>,
): Promise<T> {
  return (await pipe.transform(body, bodyMetadata(metatype))) as T;
}

describe('Product DTO validation', () => {
  it('пропускает допустимый dataType и приводит строковое число к доменному коду', async () => {
    const result = await transformBody(CreateProductDto, {
      ...baseCreatePayload,
      dataType: ' 3 ',
    });

    expect(result).toBeInstanceOf(CreateProductDto);
    expect(result.dataType).toBe(3);
  });

  it('отклоняет boolean dataType на create boundary', async () => {
    await expect(
      transformBody(CreateProductDto, {
        ...baseCreatePayload,
        dataType: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет explicit null dataType на update boundary', async () => {
    await expect(
      transformBody(UpdateProductDto, {
        dataType: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет dataType вне домена 1..4 на create boundary', async () => {
    await expect(
      transformBody(CreateProductDto, {
        ...baseCreatePayload,
        dataType: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет нечисловой dataType на update boundary', async () => {
    await expect(
      transformBody(UpdateProductDto, {
        dataType: 'daily',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет boolean dataType на update boundary', async () => {
    await expect(
      transformBody(UpdateProductDto, {
        dataType: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет isUnlimited на create boundary: типом данных владеет dataType', async () => {
    await expect(
      transformBody(CreateProductDto, {
        ...baseCreatePayload,
        dataType: 3,
        isUnlimited: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет isUnlimited на update boundary', async () => {
    await expect(
      transformBody(UpdateProductDto, {
        dataType: 1,
        isUnlimited: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет серверные поля, если admin случайно отправит весь продукт', async () => {
    await expect(
      transformBody(UpdateProductDto, {
        isActive: false,
        id: 'product-id',
        createdAt: '2026-07-07T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('оставляет частичное обновление статуса валидным', async () => {
    const result = await transformBody(UpdateProductDto, { isActive: false });

    expect(result).toBeInstanceOf(UpdateProductDto);
    expect(result.isActive).toBe(false);
  });

  it('пропускает bulk toggle по точному provider dataType', async () => {
    const result = await transformBody(BulkToggleByDataTypeDto, {
      dataType: '3',
      isActive: true,
    });

    expect(result).toBeInstanceOf(BulkToggleByDataTypeDto);
    expect(result.dataType).toBe(3);
    expect(result.isActive).toBe(true);
  });

  it('пропускает bulk toggle по aggregate daily selector', async () => {
    const result = await transformBody(BulkToggleByDataTypeDto, {
      dataType: 'daily',
      isActive: false,
    });

    expect(result).toBeInstanceOf(BulkToggleByDataTypeDto);
    expect(result.dataType).toBe('daily');
    expect(result.isActive).toBe(false);
  });

  it('отклоняет boolean dataType в bulk toggle boundary', async () => {
    await expect(
      transformBody(BulkToggleByDataTypeDto, {
        dataType: true,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет array-like coercion в bulk toggle boundary', async () => {
    await expect(
      transformBody(BulkToggleByDataTypeDto, {
        dataType: [1],
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет legacy tariffType в bulk toggle boundary', async () => {
    await expect(
      transformBody(BulkToggleByDataTypeDto, {
        tariffType: 'unlimited',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
