import { Injectable, NotFoundException, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EsimProviderService } from '../esim-provider/esim-provider.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { buildProductsWhere, type ProductListFilters } from './products.filters';

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
   * Включить/выключить ВСЕ тарифы по типу (стандартные или безлимитные)
   */
  async bulkToggleByType(tariffType: 'standard' | 'unlimited', isActive: boolean) {
    const isUnlimited = tariffType === 'unlimited';
    const typeName = isUnlimited ? 'безлимитных' : 'стандартных';
    
    this.logger.log(`🔄 ${isActive ? 'Включение' : 'Выключение'} ВСЕХ ${typeName} тарифов...`);
    
    const result = await this.prisma.esimProduct.updateMany({
      where: { isUnlimited },
      data: { isActive },
    });

    this.logger.log(`✅ ${isActive ? 'Включено' : 'Выключено'} ${result.count} ${typeName} тарифов`);
    
    return {
      success: true,
      updated: result.count,
      tariffType,
      isActive,
      message: `${isActive ? 'Включено' : 'Выключено'} ${result.count} ${typeName} тарифов`,
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

  async create(data: Prisma.EsimProductCreateInput) {
    return this.prisma.esimProduct.create({
      data,
    });
  }

  async update(id: string, data: Prisma.EsimProductUpdateInput) {
    const product = await this.findById(id);

    return this.prisma.esimProduct.update({
      where: { id: product.id },
      data,
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
   *  2. Группируем по ключу: country|dataAmount|validityDays|isUnlimited|providerPrice
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
        p.isUnlimited ? 'U' : 'S',
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
   * СИНХРОНИЗАЦИЯ V4 - STANDARD + UNLIMITED
   * Volume приходит в KB из eSIM Access API
   * Price приходит в центах USD
   * dataType: 1 = standard, 2 = unlimited/day pass
   */
  async syncWithProvider() {
    this.logger.log('🔄 [SYNC V12] Начало синхронизации (dataType=1 и dataType=2)...');
    
    try {
      // Получаем настройки ценообразования из БД
      const pricingSettings = await this.getPricingSettings();
      const exchangeRate = pricingSettings.exchangeRate;
      const defaultMarkup = pricingSettings.defaultMarkupPercent;
      const markupMultiplier = 1 + defaultMarkup / 100;
      
      this.logger.log(`📊 Настройки: курс=${exchangeRate}₽/$, наценка=${defaultMarkup}%`);
      
      // Делаем 2 запроса с правильным параметром dataType (из документации eSIM Access)
      // dataType=1 для стандартных, dataType=2 для Day Pass/Unlimited
      let standardPackages: any[] = [];
      let unlimitedPackages: any[] = [];
      
      try {
        this.logger.log('📦 Запрос стандартных тарифов (dataType=1)...');
        standardPackages = await this.esimProviderService.getPackages(undefined, 1) || [];
        this.logger.log(`✅ Стандартных получено: ${standardPackages.length}`);
      } catch (err) {
        this.logger.warn(`⚠️ Ошибка получения стандартных: ${err.message}`);
      }
      
      try {
        this.logger.log('📦 Запрос Day Pass/Unlimited тарифов (dataType=2)...');
        unlimitedPackages = await this.esimProviderService.getPackages(undefined, 2) || [];
        this.logger.log(`✅ Day Pass получено: ${unlimitedPackages.length}`);
      } catch (err) {
        this.logger.warn(`⚠️ Ошибка получения Day Pass: ${err.message}`);
      }
      
      // Объединяем с маркировкой типа
      const allPackages = [
        ...standardPackages.map(p => ({ ...p, isUnlimitedFlag: false })),
        ...unlimitedPackages.map(p => ({ ...p, isUnlimitedFlag: true })),
      ];
      
      if (allPackages.length === 0) {
        return { success: false, synced: 0, errors: 1, message: 'API провайдера не вернул тарифы. Проверьте баланс и API ключи.' };
      }
      
      this.logger.log(`📦 Всего: ${allPackages.length} (${standardPackages.length} стандартных + ${unlimitedPackages.length} Day Pass)`);
      
      if (!allPackages || allPackages.length === 0) {
        return { success: false, synced: 0, errors: 1, message: 'Не удалось получить список пакетов' };
      }

      const packages = allPackages;
      this.logger.log(`📦 Всего ${packages.length} пакетов для синхронизации`);
      
      let synced = 0;
      let errors = 0;
      
      for (const pkg of packages) {
        try {
          // ============================================
          // КОНВЕРТАЦИЯ ОБЪЁМА (volume в БАЙТАХ -> GB/MB)
          // ============================================
          // API возвращает volume в БАЙТАХ!
          // 524288000 bytes = 500 MB
          // 1073741824 bytes = 1 GB
          // 10737418240 bytes = 10 GB
          
          const volumeInBytes = Number(pkg.volume) || 0;
          const volumeInMB = volumeInBytes / (1024 * 1024);
          const volumeInGB = volumeInBytes / (1024 * 1024 * 1024);
          
          let dataAmount: string;
          if (volumeInGB >= 1) {
            // 1 GB и больше - показываем в GB
            dataAmount = `${Math.round(volumeInGB)} GB`;
          } else {
            // Меньше 1 GB - показываем в MB
            dataAmount = `${Math.round(volumeInMB)} MB`;
          }
          
          // ============================================
          // КОНВЕРТАЦИЯ ЦЕНЫ (из настроек БД!)
          // ============================================
          // API eSIM Access: price в сотых центах (1/10000 доллара)
          // Пример: 86500 = $8.65
          
          const priceRaw = Number(pkg.price) || 0;
          const priceInUSD = priceRaw / 10000;  // сотые центы -> доллары
          const priceWithMarkup = priceInUSD * markupMultiplier;
          const priceInRUB = this.calculateRubPrice(priceRaw, exchangeRate, defaultMarkup);
          
          // DEBUG: первый пакет
          if (synced === 0) {
            this.logger.warn(`🔍 [SYNC V12] Первый пакет:`);
            this.logger.warn(`   name: ${pkg.name}`);
            this.logger.warn(`   volume: ${volumeInBytes} bytes -> ${volumeInMB.toFixed(1)} MB -> ${volumeInGB.toFixed(2)} GB -> "${dataAmount}"`);
            this.logger.warn(`   price: ${priceRaw} / 10000 = $${priceInUSD.toFixed(2)} -> +${defaultMarkup}% -> $${priceWithMarkup.toFixed(2)} -> ₽${priceInRUB}`);
          }
          
          // Определяем isUnlimited по названию (содержит /Day или Daily = Day Pass)
          const pkgName = pkg.name || pkg.slug || '';
          const isUnlimitedByName = pkgName.toLowerCase().includes('/day') || 
                                     pkgName.toLowerCase().includes('daily');
          
          // Для Daily Unlimited: 
          // - validity = 180 дней (стандартный срок действия Day Pass)
          // - duration = 1 (дневной лимит)
          // Для стандартных: validity = duration
          let validity: number;
          let duration: number;
          let speed: string;
          
          if (isUnlimitedByName) {
            // Day Pass тарифы
            validity = 180; // Стандартный срок действия для Day Pass
            duration = 1;   // Дневной лимит
            
            // Парсим скорость после лимита из названия
            // Примеры: "1GB/Day FUP1Mbps" -> "1 Mbps", "10GB/Day" -> "384 Kbps"
            const speedMatch = pkgName.match(/FUP(\d+)\s*(Mbps|Kbps)/i);
            if (speedMatch) {
              speed = `${speedMatch[1]} ${speedMatch[2]}`;
            } else if (pkg.fupPolicy) {
              speed = String(pkg.fupPolicy).trim();
            } else {
              speed = '384 Kbps'; // Дефолт для Day Pass без FUP в названии
            }
          } else {
            // Стандартные тарифы
            validity = pkg.duration;
            duration = pkg.duration;
            speed = ''; // Для стандартных нет ограничения скорости
          }
          
          // Формируем описание
          let description: string;
          if (isUnlimitedByName) {
            description = `${dataAmount} в день, на ${validity} дней. После лимита: ${speed}`;
          } else {
            description = `${dataAmount} на ${duration} дней`;
          }
          
          const coverageRegion = this.getCoverageRegion(pkg);
          const resolvedCountry = pkg.locationCode || pkg.location || 'Unknown';
          const autoTags = this.inferTagsFromPackage(pkg, resolvedCountry);

          const productData = {
            country: resolvedCountry,
            region: coverageRegion,
            name: pkgName,
            description: description,
            dataAmount: dataAmount,
            validityDays: validity,  // Для Daily Unlimited = 180, для обычных = duration
            duration: duration,      // Для Daily Unlimited = 1, для обычных = validityDays
            speed: speed,            // Ограничение скорости
            providerPrice: priceRaw,
            ourPrice: priceInRUB,
            providerId: pkg.packageCode,
            providerName: 'esimaccess',
            isUnlimited: isUnlimitedByName,
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
              isUnlimited: productData.isUnlimited,
              providerPrice: priceRaw,
              providerName: 'esimaccess',
            },
          }) : null;

          if (existing) {
            // Для существующих продуктов НЕ затираем кастомные настройки:
            // - ourPrice (кастомная наценка)
            // - isActive (скрытие тарифа)
            // - badge, badgeColor (бейджи)
            // - tags, notes (могли быть отредактированы вручную)
            // Обновляем только данные от провайдера
            await this.prisma.esimProduct.update({
              where: { id: existing.id },
              data: {
                country: productData.country,
                region: productData.region,
                name: productData.name,
                description: productData.description,
                dataAmount: productData.dataAmount,
                validityDays: productData.validityDays,
                duration: productData.duration,       // Новое поле
                speed: productData.speed,             // Новое поле
                providerPrice: productData.providerPrice,
                // ourPrice - НЕ трогаем! Сохраняем кастомную наценку
                isUnlimited: productData.isUnlimited,
                // isActive - НЕ трогаем! Сохраняем настройку скрытия
                // badge, badgeColor - НЕ трогаем!
                // notes - НЕ трогаем (ручное примечание)!
                // tags: дополняем автоматическими, если пусты (т.е. не редактировались вручную)
                ...(existing.tags.length === 0 && autoTags.length > 0 ? { tags: autoTags } : {}),
                supportTopup: productData.supportTopup, // Обновляем — это техническая характеристика
              },
            });
          } else if (duplicate) {
            // Нашли дубль по параметрам без совпадения providerId — обновляем providerId,
            // чтобы при следующей синхронизации он попадал в ветку existing,
            // и не создаём ещё одну строку.
            this.logger.warn(`🔁 Дубль тарифа: ${pkgName} → переиспользую существующий ${duplicate.id}`);
            await this.prisma.esimProduct.update({
              where: { id: duplicate.id },
              data: {
                providerId: productData.providerId,
                name: productData.name,
                description: productData.description,
                duration: productData.duration,
                speed: productData.speed,
                // tags автоматически дополним если их ещё нет
                tags: duplicate.tags.length > 0 ? duplicate.tags : productData.tags,
              },
            });
          } else {
            // Новый продукт - создаём с дефолтными настройками
            await this.prisma.esimProduct.create({
              data: productData,
            });
          }
          
          synced++;
        } catch (error) {
          this.logger.error(`Ошибка пакета ${pkg.packageCode}:`, error.message);
          errors++;
        }
      }
      
      // Считаем сколько стандартных и безлимитных из синхронизированных
      const syncedStandard = standardPackages.length;
      const syncedUnlimited = unlimitedPackages.length;
      
      this.logger.log(`✅ [SYNC V12] Готово: ${synced} синхронизировано (${syncedStandard} стандартных + ${syncedUnlimited} Day Pass), ${errors} ошибок`);
      
      return { 
        success: true,
        synced, 
        errors,
        message: `Синхронизировано ${synced} продуктов: ${syncedStandard} стандартных + ${syncedUnlimited} Day Pass (курс: ${exchangeRate}₽/$)`,
        version: 'V12-COVERAGE-LISTS',
        settings: {
          exchangeRate,
          markupPercent: defaultMarkup,
        },
        breakdown: {
          standard: syncedStandard,
          unlimited: syncedUnlimited,
        },
      };
    } catch (error) {
      this.logger.error('❌ [SYNC V10] Ошибка:', error.message);
      return {
        success: false,
        synced: 0,
        errors: 1,
        message: error.message,
      };
    }
  }
}
