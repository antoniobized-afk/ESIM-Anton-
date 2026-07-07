import {
  PRODUCT_DATA_TYPE_LABELS,
  PRODUCT_DATA_TYPES,
  type ProductDataType,
} from '@shared/product-data-type';
import type { EsimAccessPackage } from '../esim-provider/providers/esimaccess.provider';

export interface ProductSyncDataTypeBatch {
  dataType: ProductDataType;
  packages: EsimAccessPackage[];
}

export interface ProductSyncProviderFailure {
  dataType: ProductDataType;
  label: string;
  message: string;
}

function reasonToMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function collectProductSyncProviderResults(
  results: PromiseSettledResult<EsimAccessPackage[]>[],
): { batches: ProductSyncDataTypeBatch[]; failures: ProductSyncProviderFailure[] } {
  const batches: ProductSyncDataTypeBatch[] = [];
  const failures: ProductSyncProviderFailure[] = [];

  PRODUCT_DATA_TYPES.forEach((dataType, index) => {
    const result = results[index];
    if (!result) return;

    if (result.status === 'fulfilled') {
      batches.push({
        dataType,
        packages: result.value ?? [],
      });
      return;
    }

    failures.push({
      dataType,
      label: PRODUCT_DATA_TYPE_LABELS[dataType],
      message: reasonToMessage(result.reason),
    });
  });

  return { batches, failures };
}

export function formatEmptyProductSyncMessage(providerFailures: ProductSyncProviderFailure[]): string {
  const failedLabels = providerFailures.map((failure) => failure.label).join(', ');

  return failedLabels
    ? `API провайдера не вернул тарифы. Не загружены provider dataType: ${failedLabels}. Проверьте баланс и API ключи.`
    : 'API провайдера не вернул тарифы. Проверьте баланс и API ключи.';
}

export function formatProductSyncMessage(params: {
  breakdownText: string;
  exchangeRate: number;
  packageErrors: number;
  providerFailures: ProductSyncProviderFailure[];
  synced: number;
  totalErrors: number;
}): string {
  const base = `${params.synced} продуктов (${params.breakdownText}, курс: ${params.exchangeRate}₽/$)`;
  if (params.totalErrors === 0) return `Синхронизировано ${base}`;

  const providerFailureLabels = params.providerFailures.map((failure) => failure.label).join(', ');

  return `Частично синхронизировано ${base}. Ошибки: ${params.totalErrors}`
    + (providerFailureLabels ? `; не загружены provider dataType: ${providerFailureLabels}` : '')
    + (params.packageErrors > 0 ? `; ошибки обработки пакетов: ${params.packageErrors}` : '');
}
