import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

/**
 * Интерфейсы для eSIM Access API
 * Документация: https://docs.esimaccess.com/
 */

export interface EsimAccessPackage {
  packageCode: string;
  name: string;
  slug: string;
  location: string;
  locationCode: string;
  description?: string;
  price: number;
  currencyCode: string;
  volume: number;
  smsVolume: number;
  duration: number;      // Для Daily Unlimited = 1 (в день)
  durationUnit: string;
  validity: number;      // Срок действия (180 дней для Daily Unlimited)
  speed: string;         // Ограничение скорости после лимита
  fupPolicy?: string;
  supportTopup: boolean;
  // Сырой код поддержки пополнения от eSIM Access: 1 = нет, 2 = да,
  // 3 = да с periodNum (Day Pass). `supportTopup` — это производный boolean.
  supportTopUpType?: number;
  dataType?: number;     // 1 = standard, 2 = unlimited/day pass
  coverageCountries?: string[];
}

export interface EsimAccessPurchaseResponse {
  success: boolean;
  orderNo: string;
  esimList: {
    iccid: string;
    lpaCode: string;
    smdpAddress: string;
    matchingCode: string;
    qrCodeUrl: string;
  }[];
}

export interface EsimAccessBalance {
  balance: number;
  currency: string;
}

/**
 * Провайдер для работы с eSIM Access API
 * Документация: https://docs.esimaccess.com/
 */
@Injectable()
export class EsimAccessProvider {
  private readonly logger = new Logger(EsimAccessProvider.name);
  private readonly client: AxiosInstance;
  private readonly accessCode: string;
  private readonly secretKey: string;
  private readonly debugSensitiveLogs: boolean;

  constructor(accessCode: string, secretKey: string) {
    this.accessCode = accessCode;
    this.secretKey = secretKey;
    this.debugSensitiveLogs = process.env.DEBUG_SENSITIVE_LOGS === 'true';

    this.client = axios.create({
      baseURL: 'https://api.esimaccess.com/api/v1/open',
      timeout: 90000, // 90 секунд для больших списков пакетов
      headers: {
        'Content-Type': 'application/json',
        'RT-AccessCode': this.accessCode,
      },
    });

    this.logger.log('✅ eSIM Access provider инициализирован');
  }

  /**
   * Генерация подписи для API
   */
  private generateSignature(timestamp: number): string {
    const signStr = `${this.accessCode}${this.secretKey}${timestamp}`;
    return crypto.createHash('md5').update(signStr).digest('hex');
  }

  /**
   * Добавление заголовков авторизации
   */
  private getAuthHeaders() {
    const timestamp = Date.now();
    return {
      'RT-AccessCode': this.accessCode,
      'RT-Timestamp': String(timestamp),
      'RT-Signature': this.generateSignature(timestamp),
    };
  }

  private maskValue(value?: string | number | null, visibleStart = 2, visibleEnd = 4): string {
    if (value === null || value === undefined) return 'n/a';
    const text = String(value);
    if (text.length <= visibleStart + visibleEnd) return text;
    return `${text.slice(0, visibleStart)}***${text.slice(-visibleEnd)}`;
  }

  private summarizeProviderResponse(data: any) {
    return {
      success: Boolean(data?.success),
      errorCode: data?.errorCode ?? null,
      errorMsg: data?.errorMsg ?? null,
      orderNo: data?.obj?.orderNo ? this.maskValue(data.obj.orderNo, 2, 4) : null,
      esimCount: Array.isArray(data?.obj?.esimList)
        ? data.obj.esimList.length
        : Array.isArray(data?.obj?.profileList)
          ? data.obj.profileList.length
          : null,
    };
  }

  private logRawDebug(label: string, payload: any) {
    if (!this.debugSensitiveLogs) return;
    this.logger.debug(`${label}: ${JSON.stringify(payload)}`);
  }

  /**
   * Получить баланс аккаунта
   */
  async getBalance(): Promise<EsimAccessBalance> {
    try {
      this.logger.log('💰 Запрос баланса...');

      const response = await this.client.post('/balance/query', {}, {
        headers: this.getAuthHeaders(),
      });

      if (response.data?.success && response.data?.obj) {
        this.logger.log(`✅ Баланс: ${response.data.obj.balance} ${response.data.obj.currencyCode}`);
        return {
          balance: response.data.obj.balance,
          currency: response.data.obj.currencyCode,
        };
      }

      throw new Error(response.data?.errorMsg || 'Ошибка получения баланса');
    } catch (error: any) {
      this.logger.error('❌ Ошибка получения баланса:', error.message);
      throw error;
    }
  }

  /**
   * Получить список доступных пакетов
   * @param locationCode - фильтр по стране
   * @param dataType - 1 = стандартные, 2 = unlimited/day pass
   */
  async getPackages(locationCode?: string, dataType?: number): Promise<EsimAccessPackage[]> {
    try {
      this.logger.log(`📦 Запрос пакетов (dataType=${dataType || 'all'})...`);

      const payload: any = {
        pager: { pageNum: 1, pageSize: 500 }
      };

      if (locationCode) {
        payload.locationCode = locationCode;
      }

      if (dataType) {
        payload.dataType = dataType; // 1 = standard, 2 = unlimited/day pass (из документации)
      }

      const response = await this.client.post('/package/list', payload, {
        headers: this.getAuthHeaders(),
      });

      if (!response.data?.success) {
        throw new Error(response.data?.errorMsg || 'Ошибка получения пакетов');
      }

      const packages = response.data?.obj?.packageList || [];

      this.logger.log(`✅ Получено ${packages.length} пакетов`);

      return packages.map((pkg: any) => ({
        packageCode: pkg.packageCode,
        name: pkg.name,
        slug: pkg.slug,
        location: pkg.location,
        locationCode: pkg.locationCode,
        description: pkg.description,
        price: pkg.price,
        currencyCode: pkg.currencyCode,
        volume: pkg.volume,
        smsVolume: pkg.smsVolume || 0,
        duration: pkg.duration,
        durationUnit: pkg.durationUnit,
        validity: pkg.validity || pkg.duration, // Срок действия (для Day Pass обычно 180)
        speed: pkg.speed || '',                  // Ограничение скорости
        fupPolicy: pkg.fupPolicy || '',
        // eSIM Access помечает пополняемость полем `supportTopUpType` (число!),
        // а НЕ boolean `supportTopup`. Семантика по доке: 1 = нет, 2 = да,
        // 3 = да (c periodNum). Раньше читали несуществующее поле → у всех продуктов
        // кэшировался false и кнопка «Пополнить» не показывалась. Нормализуем к boolean.
        supportTopup: pkg.supportTopUpType === 2 || pkg.supportTopUpType === 3,
        supportTopUpType: pkg.supportTopUpType,
        dataType: dataType || (pkg.type || 1),   // Сохраняем тип
        coverageCountries: Array.isArray(pkg.locationNetworkList)
          ? pkg.locationNetworkList
            .map((item: any) => item?.locationName)
            .filter((name: any) => typeof name === 'string' && name.trim().length > 0)
          : [],
      }));
    } catch (error: any) {
      this.logger.error('❌ Ошибка получения пакетов:', error.message);
      throw error;
    }
  }

  /**
   * Купить eSIM
   */
  async purchaseEsim(packageCode: string, quantity = 1, transactionId?: string, periodNum?: number, price?: number, customerEmail?: string): Promise<EsimAccessPurchaseResponse> {
    try {
      this.logger.log(
        `💳 Покупка eSIM (package=${packageCode}, quantity=${quantity}, periodNum=${periodNum || 'N/A'}, tx=${this.maskValue(transactionId || `mojo_${Date.now()}`, 2, 6)}, emailProvided=${customerEmail ? 'yes' : 'no'})...`,
      );

      const packageInfo: Record<string, any> = {
        packageCode,
        count: quantity,
      };
      if (price) {
        packageInfo.price = price;
      }
      if (periodNum && periodNum > 0) {
        packageInfo.periodNum = periodNum;
      }

      const payload: Record<string, any> = {
        transactionId: transactionId || `mojo_${Date.now()}`,
        packageInfoList: [packageInfo],
      };

      // Если передан email — eSIM Access отправит eSIM напрямую на почту клиента
      if (customerEmail) {
        payload.email = customerEmail;
      }

      this.logRawDebug('eSIM Access purchase payload', payload);

      const response = await this.client.post('/esim/order', payload, {
        headers: this.getAuthHeaders(),
      });

      this.logger.log(`📥 eSIM Access order response: ${JSON.stringify(this.summarizeProviderResponse(response.data))}`);
      this.logRawDebug('eSIM Access order raw response', response.data);

      if (response.data?.success && response.data?.obj) {
        const order = response.data.obj;
        this.logger.log(`✅ eSIM куплен успешно (order=${this.maskValue(order.orderNo, 2, 4)})`);

        let esimList = order.esimList || [];

        // Если esimList пуст — запросим профили отдельно (Query Allocated Profiles)
        if (esimList.length === 0 && order.orderNo) {
          this.logger.log(
            `🔄 esimList пуст, запрашиваем профили по orderNo ${this.maskValue(order.orderNo, 2, 4)}...`,
          );
          await new Promise(resolve => setTimeout(resolve, 2000));

          try {
            const queryResponse = await this.client.post('/esim/query', {
              orderNo: order.orderNo,
              pager: { pageNum: 1, pageSize: 10 },
            }, { headers: this.getAuthHeaders() });

            this.logger.log(`📥 eSIM Access query response: ${JSON.stringify(this.summarizeProviderResponse(queryResponse.data))}`);
            this.logRawDebug('eSIM Access query raw response', queryResponse.data);

            if (queryResponse.data?.success && queryResponse.data?.obj) {
              const queryObj = queryResponse.data.obj;
              esimList = queryObj.esimList || queryObj.profileList || [];
              if (esimList.length === 0 && queryObj.iccid) {
                esimList = [queryObj];
              }
            }
          } catch (queryError: any) {
            this.logger.warn(`⚠️ Не удалось запросить профили: ${queryError.message}`);
          }
        }

        return {
          success: true,
          orderNo: order.orderNo,
          esimList: esimList.map((esim: any) => ({
            iccid: esim.iccid || '',
            lpaCode: esim.lpa || esim.ac || esim.lpaCode || '',
            smdpAddress: esim.smdpAddress || esim.smdp || '',
            matchingCode: esim.confirmationCode || esim.matchingId || esim.matchingCode || '',
            qrCodeUrl: esim.qrCodeUrl || '',
          })),
        };
      }

      throw new Error(response.data?.errorMsg || `API returned error (success=${String(response.data?.success)})`);
    } catch (error: any) {
      this.logger.error('❌ Ошибка покупки eSIM:', error.message);
      throw error;
    }
  }

  /**
   * Получить информацию о заказе
   */
  async getOrderInfo(orderNo: string): Promise<any> {
    try {
      this.logger.log(`🔍 Запрос информации о заказе ${this.maskValue(orderNo, 2, 4)}...`);

      const response = await this.client.post('/esim/query', {
        orderNo,
        pager: { pageNum: 1, pageSize: 10 },
      }, {
        headers: this.getAuthHeaders(),
      });

      if (!response.data?.success) {
        throw new Error(response.data?.errorMsg || 'Ошибка получения заказа');
      }

      this.logger.log(`✅ Информация о заказе получена`);

      return response.data.obj;
    } catch (error: any) {
      this.logger.error('❌ Ошибка получения информации о заказе:', error.message);
      throw error;
    }
  }

  /**
   * Получить историю заказов
   */
  async getOrderHistory(pageNum = 1, pageSize = 100): Promise<any[]> {
    try {
      this.logger.log(`📜 Запрос истории заказов (page: ${pageNum}, size: ${pageSize})...`);

      const response = await this.client.post('/esim/query', {
        pager: { pageNum, pageSize },
      }, {
        headers: this.getAuthHeaders(),
      });

      if (!response.data?.success) {
        throw new Error(response.data?.errorMsg || 'Ошибка получения заказов');
      }

      const orders = response.data?.obj?.esimList || [];

      this.logger.log(`✅ Получено ${orders.length} заказов`);

      return orders;
    } catch (error: any) {
      this.logger.error('❌ Ошибка получения истории заказов:', error.message);
      throw error;
    }
  }

  /**
   * Пополнить/продлить eSIM (Top-up)
   * Работает только для пакетов где supportTopup = true.
   *
   * `periodNum` передаётся только для пакетов с `supportTopUpType = 3`
   * (Day Pass): это число периодов/дней, на которое продлевается тариф.
   * Для обычных пакетов (`supportTopUpType = 2`) он не нужен и не отправляется —
   * ровно та же семантика, что у `purchaseEsim`.
   */
  async topupEsim(iccid: string, packageCode: string, transactionId?: string, periodNum?: number): Promise<any> {
    try {
      this.logger.log(
        `🔄 Пополнение eSIM (iccid=${this.maskValue(iccid, 2, 4)}, package=${packageCode}, periodNum=${periodNum || 'N/A'})...`,
      );

      const payload: Record<string, any> = {
        iccid,
        packageCode,
        transactionId: transactionId || `topup_${Date.now()}`,
      };
      if (periodNum && periodNum > 0) {
        payload.periodNum = periodNum;
      }

      const response = await this.client.post('/esim/topup', payload, {
        headers: this.getAuthHeaders(),
      });

      if (response.data?.success && response.data?.obj) {
        this.logger.log(`✅ eSIM пополнен успешно`);
        return {
          success: true,
          orderNo: response.data.obj.orderNo,
          ...response.data.obj,
        };
      }

      throw new Error(response.data?.errorMsg || 'Ошибка пополнения eSIM');
    } catch (error: any) {
      this.logger.error('❌ Ошибка пополнения eSIM:', error.message);
      throw error;
    }
  }

  /**
   * Получить информацию об eSIM по ICCID.
   *
   * Предпочитает `POST /esim/list` по ICCID (Query Allocated Profiles), потому
   * что именно он чаще отдаёт usage/остаток/срок по уже купленным профилям.
   * Если этот endpoint недоступен или вернул пусто — делаем fallback на
   * `POST /esim/query` с тем же ICCID.
   *
   * Возвращает `response.data.obj` целиком — там лежит `esimList[]` с usage,
   * статусом, сроком и SMDP. Точная форма зависит от версии API провайдера,
   * поэтому при первой проблеме можно смотреть debug-лог полного ответа.
   */
  async getEsimInfo(iccid: string): Promise<any> {
    // this.logger.log(`🔍 Запрос информации об eSIM ${this.maskValue(iccid, 2, 4)}...`);

    try {
      const queryResponse = await this.client.post('/esim/query', {
        iccid,
        pager: { pageNum: 1, pageSize: 20 },
      }, {
        headers: this.getAuthHeaders(),
      });

      if (!queryResponse.data?.success) {
        this.logger.warn(
          `⚠️ Провайдер вернул success=false для ICCID ${this.maskValue(iccid, 2, 4)}: ${JSON.stringify(this.summarizeProviderResponse(queryResponse.data))}`,
        );
        throw new Error(queryResponse.data?.errorMsg || 'Ошибка получения информации об eSIM');
      }

      const obj = queryResponse.data.obj;
      const esimCount = Array.isArray(obj?.esimList) ? obj.esimList.length 
                      : Array.isArray(obj?.profileList) ? obj.profileList.length
                      : obj?.iccid ? 1 : 0;
      // this.logger.log(
      //   `✅ Информация об eSIM получена через /esim/query (iccid=${this.maskValue(iccid, 2, 4)}, count=${esimCount})`,
      // );
      this.logRawDebug(`getEsimInfo /esim/query raw response for ${this.maskValue(iccid, 2, 4)}`, queryResponse.data);

      if (esimCount === 0) {
        // this.logger.warn(
        //   `⚠️ Результат пуст для ICCID ${this.maskValue(iccid, 2, 4)}. Возможно, провайдер ещё не отдаёт расход или ICCID не найден.`,
        // );
      }

      return obj;
    } catch (error: any) {
      this.logger.error('❌ Ошибка получения информации об eSIM:', error.message);
      throw error;
    }
  }

  /**
   * Получить пакеты для пополнения конкретного eSIM.
   *
   * eSIM Access НЕ имеет выделенного эндпоинта под top-up пакеты
   * (старый `/esim/topup/package` отдаёт 404). Доступные для пополнения пакеты
   * запрашиваются через обычный Package List с `type: "TOPUP"` и `iccid` —
   * провайдер вернёт только пакеты, применимые к этой eSIM.
   */
  async getTopupPackages(iccid: string): Promise<EsimAccessPackage[]> {
    try {
      this.logger.log(`📦 Запрос пакетов для пополнения eSIM ${this.maskValue(iccid, 2, 4)}...`);

      const response = await this.client.post('/package/list', {
        type: 'TOPUP',
        iccid,
        pager: { pageNum: 1, pageSize: 500 },
      }, {
        headers: this.getAuthHeaders(),
      });

      if (!response.data?.success) {
        throw new Error(response.data?.errorMsg || 'Ошибка получения пакетов для пополнения');
      }

      const packages = response.data?.obj?.packageList || [];

      this.logger.log(`✅ Получено ${packages.length} пакетов для пополнения`);

      return packages.map((pkg: any) => ({
        packageCode: pkg.packageCode,
        name: pkg.name,
        slug: pkg.slug,
        location: pkg.location,
        locationCode: pkg.locationCode,
        description: pkg.description,
        price: pkg.price,
        currencyCode: pkg.currencyCode,
        volume: pkg.volume,
        smsVolume: pkg.smsVolume || 0,
        duration: pkg.duration,
        durationUnit: pkg.durationUnit,
        speed: pkg.speed,
        fupPolicy: pkg.fupPolicy || '',
        // Это уже список top-up пакетов: если провайдер прислал `supportTopUpType`
        // (1 = нет, 2 = да, 3 = да с periodNum) — уважаем его, иначе считаем пакет
        // пополняемым (не прячем по умолчанию).
        supportTopup:
          pkg.supportTopUpType !== undefined
            ? pkg.supportTopUpType === 2 || pkg.supportTopUpType === 3
            : pkg.supportTopup !== false,
        supportTopUpType: pkg.supportTopUpType,
        coverageCountries: Array.isArray(pkg.locationNetworkList)
          ? pkg.locationNetworkList
            .map((item: any) => item?.locationName)
            .filter((name: any) => typeof name === 'string' && name.trim().length > 0)
          : [],
      }));
    } catch (error: any) {
      this.logger.error('❌ Ошибка получения пакетов для пополнения:', error.message);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getBalance();
      return true;
    } catch (error: any) {
      this.logger.warn('⚠️ Health check failed:', error.message);
      return false;
    }
  }
}
