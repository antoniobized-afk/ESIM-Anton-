import { Injectable, NotFoundException, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { EsimProviderService } from '../esim-provider/esim-provider.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import {
  DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE,
  DAILY_PRODUCT_DATA_TYPES,
  PRODUCT_DATA_TYPE_LABELS,
  PRODUCT_DATA_TYPES,
  isDailyProductDataType,
  normalizeProductDataType,
  type ProductDataType,
  type ProductDataTypeSelector,
} from '@shared/product-data-type';
import { buildProductsWhere, type ProductListFilters } from './products.filters';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { normalizeCreateProductData, normalizeUpdateProductData } from './products.write-normalizer';
import { buildSyncedProductPlan } from './products.sync-model';
import {
  collectProductSyncProviderResults,
  formatEmptyProductSyncMessage,
  formatProductSyncMessage,
} from './products.sync-result';

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);
  
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => EsimProviderService))
    private esimProviderService: EsimProviderService,
    private systemSettingsService: SystemSettingsService,
  ) {}

  /**
   * Получить настройки ценообразования из БД
   */
  private async getPricingSettings() {
    return this.systemSettingsService.getPricingSettings();
  }

  private calculateRubPrice(providerPriceRaw: number, exchangeRate: number, markupPercent: number) {
    const providerPriceUSD = Number(providerPriceRaw) / 10000;
    const priceWithMarkup = providerPriceUSD * (1 + markupPercent / 100);
    return Math.round(priceWithMarkup * exchangeRate);
  }

  private shouldRepairSyncedProductPrice(
    existing: { dataType?: number | null; isUnlimited: boolean },
    synced: { dataType?: number | null; isUnlimited: boolean },
  ): boolean {
    const existingDailyByContract = isDailyProductDataType(existing.dataType, existing.isUnlimited);
    const syncedDailyByContract = isDailyProductDataType(synced.dataType, synced.isUnlimited);

    return existing.isUnlimited !== synced.isUnlimited
      || existingDailyByContract !== syncedDailyByContract;
  }

  private normalizeCoverageCountries(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .filter((item, index, arr) => arr.indexOf(item) === index);
  }

  /**
   * Эвристически определяет теги-пометки тарифа по его названию/описанию/стране.
   * Используется при синхронизации с провайдером для автоматической простановки.
   * Кастомные теги, добавленные вручную в админке, НЕ затираются — синхронизация
   * для существующих продуктов теги не трогает (см. syncWithProvider).
   *
   * Важно: country здесь обычно `locationCode` (например "CN"), поэтому проверяем
   * также `pkg.location` (например "China") и `pkg.name`/`pkg.slug` — иначе
   * для китайских пакетов авто-теги не срабатывали (PR #1 баг).
   *
   * Public для unit-тестов.
   */
  inferTagsFromPackage(pkg: any, country: string): string[] {
    const tags = new Set<string>();
    const name = `${pkg.name || ''} ${pkg.slug || ''} ${pkg.description || ''}`.toLowerCase();
    const countryLc = (country || '').toLowerCase();
    const locationLc = (pkg.location || '').toString().toLowerCase();

    // ──────────────────────────────────────────────────────────
    // Маркеры HK IP — провайдер (eSIM Access) роутит трафик через
    // Гонконг для дешёвых пакетов ЛЮБЫХ стран (не только Китая).
    // Маркер nonhkip/non-hk/etc. означает, что трафик идёт напрямую
    // через сеть страны назначения → IP страны, нет блокировок
    // TikTok/Facebook и т.д. Такие пакеты дороже.
    // ──────────────────────────────────────────────────────────
    const isNonHkIp =
      name.includes('nonhkip') ||
      name.includes('non-hk') ||
      name.includes('non hk') ||
      name.includes('no hk') ||
      name.includes('no hong kong') ||
      name.includes('excluding hk') ||
      name.includes('exclude hk') ||
      name.includes('mainland');

    const hasHkExplicit =
      name.includes('hk ip') ||
      name.includes('hong kong ip') ||
      name.includes('via hk') ||
      name.includes('via hong kong');

    const looksLikeChina =
      countryLc.includes('china') ||
      countryLc === 'cn' ||
      locationLc.includes('china') ||
      name.includes('china') ||
      name.includes('cn ');

    if (isNonHkIp) {
      tags.add('Не гонконгский IP');
      if (looksLikeChina) {
        tags.add('Материковый Китай');
      }
    } else if (hasHkExplicit) {
      tags.add('Гонконгский IP');
    }

    // Скоростные пометки. Используем регекс с границами, чтобы не путать
    // объём («5GB», «10GB») со скоростью («5G», «4G»).
    if (/(^|[^\d])5g($|[^bB\d])/.test(name)) tags.add('5G');
    else if (/(^|[^\d])4g($|[^bB\d])/.test(name) || /\blte\b/.test(name)) {
      tags.add('4G/LTE');
    }

    // Тип трафика
    if (name.includes('/day') || name.includes('daily') || name.includes('day pass')) {
      tags.add('Дневной лимит');
    }
    if (name.includes('hotspot') || name.includes('tethering')) tags.add('Раздача Wi-Fi');
    if (name.includes('voice') || name.includes('call')) tags.add('Голосовые звонки');
    if (name.includes('sms')) tags.add('SMS');

    // Региональные пометки
    if (
      name.includes('regional') ||
      name.includes('multi-country') ||
      name.includes('multi country') ||
      name.includes('multicountry')
    ) {
      tags.add('Мульти-страна');
    }

    return Array.from(tags);
  }

  private getCoverageRegion(pkg: any): string | undefined {
    const coverageCountries = this.normalizeCoverageCountries(pkg.coverageCountries);
    if (coverageCountries.length > 1) {
      return coverageCountries.join(', ');
    }

    if (coverageCountries.length === 1) {
      return undefined;
    }

    const rawLocation = typeof pkg.location === 'string' ? pkg.location.trim() : '';
    const rawCode = typeof pkg.locationCode === 'string' ? pkg.locationCode.trim() : '';
    const pkgName = typeof pkg.name === 'string' ? pkg.name.toLowerCase() : '';

    const looksRegional =
      rawLocation.includes(',') ||
      (!/^[A-Z]{2}$/.test(rawCode) && rawLocation.length > 2) ||
      ['global', 'world', 'worldwide', 'europe', 'asia', 'africa', 'america'].some(word =>
        `${rawLocation} ${pkgName}`.toLowerCase().includes(word)
      );

    return looksRegional ? rawLocation || undefined : undefined;
  }

  async onModuleInit() {
    // Автосинхронизация отключена - данные уже в БД
    // Синхронизация запускается вручную через POST /api/products/sync
    const count = await this.prisma.esimProduct.count();
    this.logger.log(`📦 В базе ${count} продуктов. Автосинхронизация отключена.`);
  }

  async findAll(filters?: ProductListFilters) {
    const where = buildProductsWhere(filters);

    return this.prisma.esimProduct.findMany({
      where,
      orderBy: [{ country: 'asc' }, { ourPrice: 'asc' }],
    });
  }

  async findAllPaginated(filters?: ProductListFilters & { page?: number; limit?: number }) {
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 50), 200);
    const skip = (page - 1) * limit;
    const where = buildProductsWhere(filters);

    const [data, total] = await Promise.all([
      this.prisma.esimProduct.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ country: 'asc' }, { ourPrice: 'asc' }],
      }),
      this.prisma.esimProduct.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getCountries() {
    // Возвращаем ВСЕ страны (включая неактивные продукты) для админки
    const products = await this.prisma.esimProduct.findMany({
      select: { country: true },
      distinct: ['country'],
      orderBy: { country: 'asc' },
    });

    return products.map((p) => p.country);
  }

  // =====================================================
  // МАССОВЫЕ ОПЕРАЦИИ
  // =====================================================

  /**
   * Массовое включение/выключение продуктов
   */
  async bulkUpdateActive(ids: string[], isActive: boolean) {
    this.logger.log(`🔄 Массовое ${isActive ? 'включение' : 'выключение'} ${ids.length} продуктов...`);
    
    const result = await this.prisma.esimProduct.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });

    this.logger.log(`✅ Обновлено ${result.count} продуктов`);
    
    return {
      success: true,
      updated: result.count,
      message: `${isActive ? 'Активировано' : 'Деактивировано'} ${result.count} продуктов`,
    };
  }

  /**
   * Включить/выключить тарифы по provider dataType.
   * Aggregate dataType='daily' означает все дневные provider-типы 2..4.
   */
  async bulkToggleByDataType(dataType: ProductDataTypeSelector, isActive: boolean) {
    const typeName = dataType === DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE
      ? 'дневных тарифов'
      : `тарифов "${PRODUCT_DATA_TYPE_LABELS[dataType]}"`;
    const where = dataType === DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE
      ? { dataType: { in: [...DAILY_PRODUCT_DATA_TYPES] } }
      : { dataType };
    
    this.logger.log(`🔄 ${isActive ? 'Включение' : 'Выключение'} ВСЕХ ${typeName}...`);
    
    const result = await this.prisma.esimProduct.updateMany({
      where,
      data: { isActive },
    });

    this.logger.log(`✅ ${isActive ? 'Включено' : 'Выключено'} ${result.count} ${typeName}`);
    
    return {
      success: true,
      updated: result.count,
      dataType,
      isActive,
      message: `${isActive ? 'Включено' : 'Выключено'} ${result.count} ${typeName}`,
    };
  }

  /**
   * Массовая установка бейджа
   */
  async bulkSetBadge(ids: string[], badge: string | null, badgeColor: string | null) {
    this.logger.log(`🏷️ Массовая установка бейджа "${badge}" для ${ids.length} продуктов...`);
    
    const result = await this.prisma.esimProduct.updateMany({
      where: { id: { in: ids } },
      data: { badge, badgeColor },
    });

    this.logger.log(`✅ Обновлено ${result.count} продуктов`);
    
    return {
      success: true,
      updated: result.count,
      message: badge 
        ? `Бейдж "${badge}" установлен для ${result.count} продуктов`
        : `Бейдж удален у ${result.count} продуктов`,
    };
  }

  /**
   * Массовая установка наценки (пересчет ourPrice)
   */
  async bulkSetMarkup(ids: string[], markupPercent: number) {
    this.logger.log(`💰 Массовая установка наценки ${markupPercent}% для ${ids.length} продуктов...`);
    
    // Получаем настройки из БД
    const pricingSettings = await this.getPricingSettings();
    const exchangeRate = pricingSettings.exchangeRate;
    
    this.logger.log(`📊 Курс USD/RUB: ${exchangeRate}`);
    
    // Получаем все продукты
    const products = await this.prisma.esimProduct.findMany({
      where: { id: { in: ids } },
    });

    let updated = 0;

    for (const product of products) {
      const newPrice = this.calculateRubPrice(Number(product.providerPrice), exchangeRate, markupPercent);

      await this.prisma.esimProduct.update({
        where: { id: product.id },
        data: { ourPrice: newPrice },
      });
      updated++;
    }

    this.logger.log(`✅ Обновлено ${updated} продуктов с наценкой ${markupPercent}%`);
    
    return {
      success: true,
      updated,
      message: `Наценка ${markupPercent}% применена к ${updated} продуктам (курс: ${exchangeRate}₽/$)`,
    };
  }

  /**
   * Пересчитать цены всех продуктов по текущему курсу и дефолтной наценке
   */
  async repriceAllProducts() {
    const pricingSettings = await this.getPricingSettings();
    const exchangeRate = pricingSettings.exchangeRate;
    const defaultMarkup = pricingSettings.defaultMarkupPercent;

    this.logger.log(`💱 Пересчет всех цен: курс=${exchangeRate}₽/$, наценка=${defaultMarkup}%`);

    const products = await this.prisma.esimProduct.findMany({
      select: {
        id: true,
        providerPrice: true,
      },
    });

    let updated = 0;

    for (const product of products) {
      const newPrice = this.calculateRubPrice(Number(product.providerPrice), exchangeRate, defaultMarkup);

      await this.prisma.esimProduct.update({
        where: { id: product.id },
        data: { ourPrice: newPrice },
      });

      updated++;
    }

    this.logger.log(`✅ Пересчитано ${updated} продуктов`);

    return {
      success: true,
      updated,
      exchangeRate,
      markupPercent: defaultMarkup,
      message: `Пересчитано ${updated} продуктов по курсу ${exchangeRate}₽/$ и наценке ${defaultMarkup}%`,
    };
  }

  async findByCountry(country: string) {
    return this.prisma.esimProduct.findMany({
      where: {
        country,
        isActive: true,
      },
      orderBy: { ourPrice: 'asc' },
    });
  }

  async findById(id: string) {
    const product = await this.prisma.esimProduct.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Продукт не найден');
    }

    return product;
  }

  async create(data: CreateProductDto) {
    return this.prisma.esimProduct.create({
      data: normalizeCreateProductData(data),
    });
  }

  async update(id: string, data: UpdateProductDto) {
    const product = await this.findById(id);

    return this.prisma.esimProduct.update({
      where: { id: product.id },
      data: normalizeUpdateProductData(data),
    });
  }

  async remove(id: string) {
    return this.update(id, { isActive: false });
  }

  /**
   * Найти и обработать дубликаты тарифов в БД.
   *
   * Алгоритм:
   *  1. Берём только АКТИВНЫЕ продукты (неактивные уже скрыты, нет смысла трогать).
   *  2. Группируем по ключу: country|dataAmount|validityDays|dataType|providerPrice
   *     (округлённый до копеек). Если ключ совпал → это потенциальные дубли.
   *  3. Считаем кол-во АКТИВНЫХ заказов по каждому продукту в группе. Канонический
   *     продукт = (есть активные заказы → больше) → (есть теги/notes/бейдж →
   *     ценнее для админа) → старший по createdAt (стабильный fallback).
   *  4. Остальные деактивируем (isActive=false). Заказы продолжают работать —
   *     historic FK не ломается.
   *
   * Метод бросает 0 ошибок — все updateMany в одной транзакции, чтобы либо все
   * группы прошли, либо ни одна (атомарность).
   */
  async dedupeProducts(dryRun = false) {
    this.logger.log(`🧹 Поиск дубликатов тарифов (dryRun=${dryRun})...`);

    const all = await this.prisma.esimProduct.findMany({
      where: { isActive: true },
    });

    const groups = new Map<string, typeof all>();
    for (const p of all) {
      const key = [
        p.country,
        p.dataAmount,
        p.validityDays,
        p.dataType,
        Number(p.providerPrice).toFixed(2),
      ].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    type DupReport = {
      key: string;
      kept: { id: string; name: string; activeOrders: number };
      deactivated: { id: string; name: string; activeOrders: number }[];
      warnings: string[];
    };
    const report: DupReport[] = [];

    // Подсчитаем активные заказы пакетом, чтобы не делать N+1 запросов
    const allIds = all.map((p) => p.id);
    const orderCounts = await this.prisma.order.groupBy({
      by: ['productId'],
      where: {
        productId: { in: allIds },
        status: { in: ['PAID', 'COMPLETED', 'PROCESSING'] },
      },
      _count: { _all: true },
    });
    const activeOrderMap = new Map(
      orderCounts.map((row) => [row.productId, row._count._all]),
    );

    const toDeactivate: string[] = [];

    for (const [key, items] of groups) {
      if (items.length < 2) continue;

      const enriched = items.map((p) => ({
        ...p,
        activeOrders: activeOrderMap.get(p.id) ?? 0,
      }));

      // Канонический выбор: больше активных заказов → ценнее метаданных → старший
      const sorted = [...enriched].sort((a, b) => {
        if (a.activeOrders !== b.activeOrders) return b.activeOrders - a.activeOrders;
        const aHas = (a.badge ? 1 : 0) + (a.tags.length > 0 ? 1 : 0) + (a.notes ? 1 : 0);
        const bHas = (b.badge ? 1 : 0) + (b.tags.length > 0 ? 1 : 0) + (b.notes ? 1 : 0);
        if (aHas !== bHas) return bHas - aHas;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      const [kept, ...rest] = sorted;
      const warnings: string[] = [];
      const restWithOrders = rest.filter((p) => p.activeOrders > 0);
      if (restWithOrders.length > 0) {
        warnings.push(
          `⚠️ У ${restWithOrders.length} скрываемых дублей есть активные заказы — ` +
            `сами заказы продолжат работать, но новых покупок этих тарифов не будет.`,
        );
      }

      report.push({
        key,
        kept: { id: kept.id, name: kept.name, activeOrders: kept.activeOrders },
        deactivated: rest.map((p) => ({
          id: p.id,
          name: p.name,
          activeOrders: p.activeOrders,
        })),
        warnings,
      });

      if (!dryRun) toDeactivate.push(...rest.map((p) => p.id));
    }

    if (!dryRun && toDeactivate.length > 0) {
      await this.prisma.esimProduct.updateMany({
        where: { id: { in: toDeactivate } },
        data: { isActive: false },
      });
    }

    const totalDeactivated = report.reduce((sum, r) => sum + r.deactivated.length, 0);
    this.logger.log(
      `🧹 Найдено групп дублей: ${report.length}, лишних тарифов: ${totalDeactivated}`,
    );

    return {
      success: true,
      dryRun,
      groups: report.length,
      deactivated: totalDeactivated,
      report,
      message: dryRun
        ? `Найдено ${report.length} групп дубликатов (${totalDeactivated} лишних). Запустите без dryRun чтобы скрыть.`
        : `Скрыто ${totalDeactivated} дублирующихся тарифов в ${report.length} группах.`,
    };
  }

  /**
   * Синхронизация eSIM Access: запрашиваем все provider dataType 1..4.
   */
  async syncWithProvider() {
    const syncLogTag = '[SYNC V14]';
    const syncVersion = 'V14-DATA-TYPE-PRICE-REPAIR';

    this.logger.log(`🔄 ${syncLogTag} Начало синхронизации provider dataType=1..4...`);
    
    try {
      // Получаем настройки ценообразования из БД
      const pricingSettings = await this.getPricingSettings();
      const exchangeRate = pricingSettings.exchangeRate;
      const defaultMarkup = pricingSettings.defaultMarkupPercent;
      const markupMultiplier = 1 + defaultMarkup / 100;
      
      this.logger.log(`📊 Настройки: курс=${exchangeRate}₽/$, наценка=${defaultMarkup}%`);
      
      const packageBatchResults = await Promise.allSettled(
        PRODUCT_DATA_TYPES.map((dataType) => this.esimProviderService.getPackages(undefined, dataType)),
      );
      const { batches: packageBatches, failures: providerFailures } = collectProductSyncProviderResults(packageBatchResults);
      packageBatches.forEach((batch) => {
        this.logger.log(`✅ ${PRODUCT_DATA_TYPE_LABELS[batch.dataType]}: ${batch.packages.length}`);
      });
      providerFailures.forEach((failure) => {
        this.logger.warn(`⚠️ Ошибка получения ${failure.label}: ${failure.message}`);
      });

      const syncedDataTypeCounts = Object.fromEntries(
        PRODUCT_DATA_TYPES.map((dataType) => [dataType, 0]),
      ) as Record<ProductDataType, number>;
      const packages = packageBatches.flatMap((batch) =>
        batch.packages.map((pkg) => ({
          ...pkg,
          dataType: normalizeProductDataType(pkg.dataType) ?? batch.dataType,
        })),
      );

      const providerErrors = providerFailures.length;

      if (packages.length === 0) {
        return {
          success: false,
          synced: 0,
          errors: providerErrors || 1,
          providerErrors,
          packageErrors: 0,
          providerFailures,
          message: formatEmptyProductSyncMessage(providerFailures),
        };
      }

      this.logger.log(`📦 Всего ${packages.length} пакетов для синхронизации`);
      
      let synced = 0;
      let errors = 0;
      
      for (const pkg of packages) {
        try {
          const volumeInBytes = Number(pkg.volume) || 0;
          const volumeInMB = volumeInBytes / (1024 * 1024);
          const volumeInGB = volumeInBytes / (1024 * 1024 * 1024);
          
          const plan = buildSyncedProductPlan(pkg);
          
          const priceRaw = Number(pkg.price) || 0;
          const priceInUSD = priceRaw / 10000;  // сотые центы -> доллары
          const priceWithMarkup = priceInUSD * markupMultiplier;
          const priceInRUB = this.calculateRubPrice(priceRaw, exchangeRate, defaultMarkup);
          
          if (synced === 0) {
            this.logger.warn(`🔍 ${syncLogTag} Первый пакет:`);
            this.logger.warn(`   name: ${pkg.name}`);
            this.logger.warn(`   volume: ${volumeInBytes} bytes -> ${volumeInMB.toFixed(1)} MB -> ${volumeInGB.toFixed(2)} GB -> "${plan.dataAmount}"`);
            this.logger.warn(`   price: ${priceRaw} / 10000 = $${priceInUSD.toFixed(2)} -> +${defaultMarkup}% -> $${priceWithMarkup.toFixed(2)} -> ₽${priceInRUB}`);
          }
          
          const pkgName = pkg.name || pkg.slug || '';
          
          const coverageRegion = this.getCoverageRegion(pkg);
          const resolvedCountry = pkg.locationCode || pkg.location || 'Unknown';
          const autoTags = this.inferTagsFromPackage(pkg, resolvedCountry);

          const productData = {
            country: resolvedCountry,
            region: coverageRegion,
            name: pkgName,
            description: plan.description,
            dataAmount: plan.dataAmount,
            validityDays: plan.validityDays,
            duration: plan.duration,
            dataType: plan.dataType,
            speed: plan.speed,
            providerPrice: priceRaw,
            ourPrice: priceInRUB,
            providerId: pkg.packageCode,
            providerName: 'esimaccess',
            isUnlimited: plan.isDailyPlan,
            isActive: true,
            tags: autoTags,
            // Кэш поддержки top-up — используется фронтом для скрытия кнопки «Пополнить»
            // у тарифов, для которых провайдер не даёт продлевать.
            supportTopup: pkg.supportTopup === true,
          };
          
          const existing = await this.prisma.esimProduct.findFirst({
            where: { providerId: pkg.packageCode },
          });

          // Доп. защита от дублей: если по providerId не нашли, но в БД уже
          // лежит продукт с такими же ключевыми параметрами — переиспользуем его,
          // чтобы не плодить визуально одинаковые тарифы.
          const duplicate = !existing ? await this.prisma.esimProduct.findFirst({
            where: {
              country: productData.country,
              dataAmount: productData.dataAmount,
              validityDays: productData.validityDays,
              dataType: productData.dataType,
              isUnlimited: productData.isUnlimited,
              providerPrice: priceRaw,
              providerName: 'esimaccess',
            },
          }) : null;

          if (existing) {
            const repairOurPrice = this.shouldRepairSyncedProductPrice(existing, productData);

            if (repairOurPrice) {
              this.logger.warn(
                `⚠️ ${syncLogTag} ${existing.id}: provider dataType ${existing.dataType ?? 'null'}`
                + ` / isUnlimited=${existing.isUnlimited} -> dataType ${productData.dataType}`
                + ` / isUnlimited=${productData.isUnlimited}; repair ourPrice ${existing.ourPrice} -> ${productData.ourPrice}`,
              );
            }

            // Для существующих продуктов обновляем provider-поля, не затирая ручные настройки.
            await this.prisma.esimProduct.update({
              where: { id: existing.id },
              data: {
                country: productData.country,
                region: productData.region,
                name: productData.name,
                description: productData.description,
                dataAmount: productData.dataAmount,
                validityDays: productData.validityDays,
                duration: productData.duration,
                dataType: productData.dataType,
                speed: productData.speed,
                providerPrice: productData.providerPrice,
                ...(repairOurPrice ? { ourPrice: productData.ourPrice } : {}),
                isUnlimited: productData.isUnlimited,
                ...(existing.tags.length === 0 && autoTags.length > 0 ? { tags: autoTags } : {}),
                supportTopup: productData.supportTopup,
              },
            });
          } else if (duplicate) {
            // Нашли дубль по параметрам без providerId: привязываем его к provider-пакету.
            this.logger.warn(`🔁 Дубль тарифа: ${pkgName} → переиспользую существующий ${duplicate.id}`);
            await this.prisma.esimProduct.update({
              where: { id: duplicate.id },
              data: {
                providerId: productData.providerId,
                name: productData.name,
                description: productData.description,
                duration: productData.duration,
                dataType: productData.dataType,
                speed: productData.speed,
                tags: duplicate.tags.length > 0 ? duplicate.tags : productData.tags,
              },
            });
          } else {
            await this.prisma.esimProduct.create({
              data: productData,
            });
          }
          
          syncedDataTypeCounts[plan.dataType] += 1;
          synced++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Ошибка пакета ${pkg.packageCode}:`, message);
          errors++;
        }
      }
      
      const syncedStandard = syncedDataTypeCounts[1];
      const syncedUnlimited = synced - syncedStandard;
      const breakdownText = PRODUCT_DATA_TYPES
        .map((dataType) => `${PRODUCT_DATA_TYPE_LABELS[dataType]}: ${syncedDataTypeCounts[dataType]}`)
        .join(', ');

      const totalErrors = errors + providerErrors;
      const syncMessage = formatProductSyncMessage({
        breakdownText,
        exchangeRate,
        packageErrors: errors,
        providerFailures,
        synced,
        totalErrors,
      });

      const finalLogMessage = `${syncLogTag} Готово: ${synced} синхронизировано (${breakdownText}), ${totalErrors} ошибок`
        + (providerErrors > 0 ? `, provider batch failures: ${providerErrors}` : '');
      if (totalErrors > 0) {
        this.logger.warn(`⚠️ ${finalLogMessage}`);
      } else {
        this.logger.log(`✅ ${finalLogMessage}`);
      }
      
      return { 
        success: totalErrors === 0,
        synced, 
        errors: totalErrors,
        providerErrors,
        packageErrors: errors,
        providerFailures,
        message: syncMessage,
        version: syncVersion,
        settings: {
          exchangeRate,
          markupPercent: defaultMarkup,
        },
        breakdown: {
          standard: syncedStandard,
          unlimited: syncedUnlimited,
          dataTypes: syncedDataTypeCounts,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ ${syncLogTag} Ошибка:`, message);
      return {
        success: false,
        synced: 0,
        errors: 1,
        message,
      };
    }
  }
}
