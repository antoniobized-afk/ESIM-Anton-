import {
  isDailyProductDataType,
  isDailyUnlimitedProductDataType,
  isServiceCutOffDailyProductDataType,
  isSpeedReducedDailyProductDataType,
  normalizeProductDataType,
  type ProductDataType,
} from '@shared/product-data-type';
import type { EsimAccessPackage } from '../esim-provider/providers/esimaccess.provider';

type SyncPackageShape = Pick<
  EsimAccessPackage,
  'dataType' | 'duration' | 'fupPolicy' | 'name' | 'slug' | 'speed' | 'validity' | 'volume'
>;

export type SyncedProductPlan = {
  dataAmount: string;
  dataType: ProductDataType;
  description: string;
  duration: number;
  isDailyPlan: boolean;
  speed: string;
  validityDays: number;
};

function positiveNumber(value: unknown): number | undefined {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : undefined;
}

function formatDataAmount(volumeInBytes: number, dataType: ProductDataType): string {
  if (isDailyUnlimitedProductDataType(dataType)) return 'Безлимит';

  const volumeInMB = volumeInBytes / (1024 * 1024);
  const volumeInGB = volumeInBytes / (1024 * 1024 * 1024);

  return volumeInGB >= 1
    ? `${Math.round(volumeInGB)} GB`
    : `${Math.round(volumeInMB)} MB`;
}

function getReducedSpeed(pkg: SyncPackageShape, pkgName: string): string {
  const speedMatch = pkgName.match(/FUP\s*(\d+(?:[.,]\d+)?)\s*(Mbps|Kbps)/i);
  if (speedMatch) return `${speedMatch[1].replace(',', '.')} ${speedMatch[2]}`;

  return [pkg.speed, pkg.fupPolicy]
    .map((value) => String(value ?? '').trim())
    .find(Boolean) ?? '';
}

function getDailyDescription(
  dataType: ProductDataType,
  dataAmount: string,
  validityDays: number,
  speed: string,
): string {
  const durationText = `Срок выбирается при покупке (до ${validityDays} дней).`;

  if (isSpeedReducedDailyProductDataType(dataType)) {
    const limitText = `${dataAmount} в день.`;
    return speed
      ? `${limitText} ${durationText} После лимита: ${speed}.`
      : `${limitText} ${durationText} После лимита скорость снижается.`;
  }

  if (isServiceCutOffDailyProductDataType(dataType)) {
    return `${dataAmount} в день. ${durationText} После лимита доступ отключается до следующего дневного периода.`;
  }

  return `Дневной безлимит. ${durationText}`;
}

export function buildSyncedProductPlan(pkg: SyncPackageShape): SyncedProductPlan {
  const dataType = normalizeProductDataType(pkg.dataType) ?? 1;
  const isDailyPlan = isDailyProductDataType(dataType);
  const volumeInBytes = Number(pkg.volume) || 0;
  const dataAmount = formatDataAmount(volumeInBytes, dataType);
  const duration = positiveNumber(pkg.duration) ?? 1;
  const validityDays = isDailyPlan
    ? positiveNumber(pkg.validity) ?? 180
    : duration;
  const pkgName = pkg.name || pkg.slug || '';
  const speed = isSpeedReducedDailyProductDataType(dataType)
    ? getReducedSpeed(pkg, pkgName)
    : '';

  return {
    dataAmount,
    dataType,
    description: isDailyPlan
      ? getDailyDescription(dataType, dataAmount, validityDays, speed)
      : `${dataAmount} на ${duration} дней`,
    duration,
    isDailyPlan,
    speed,
    validityDays,
  };
}
