import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { TelegramNotificationService } from '../telegram/telegram-notification.service';
import { OrderStatus } from '@prisma/client';

/**
 * Мониторинг расхода трафика и срока действия активных eSIM.
 *
 * Два cron-задания (каждый час):
 *
 * ### monitorTrafficLevels
 *   1. Берём активные eSIM (PAID/COMPLETED, есть ICCID), сортируем по
 *      lastUsageAt ASC NULLS FIRST — те, кого давно не опрашивали, идут первыми.
 *   2. Для каждой получаем usage через OrdersService.getOrderUsage (с TTL 1 час
 *      → фактически большинство заказов будут перезапрошены у провайдера).
 *   3. Между запросами — задержка throttleMs, чтобы не словить rate limit eSIM Access.
 *   4. Если остаток ниже порога (LOW_REMAINING_PERCENT) и cooldown прошёл —
 *      отправляем Telegram-уведомление, фиксируем дату.
 *   5. Уведомления группируются по telegramId — если у юзера сразу несколько eSIM
 *      «при смерти», шлём ОДНО сообщение со списком, а не спамим N раз.
 *
 * ### monitorExpiringEsims
 *   Проверяет expiresAt у активных eSIM. Если до истечения ≤ 24 часа
 *   и уведомление ещё не отправлялось — шлёт предупреждение.
 *
 * Раннее предупреждение при 80%/100% использования приходит через webhook
 * DATA_USAGE от eSIM Access (обрабатывается в EsimProviderService.handleWebhook).
 *
 * Если ENV TRAFFIC_MONITOR_ENABLED=false — кроны не выполняются (для прод-отладки).
 */
@Injectable()
export class TrafficMonitorService {
  private readonly logger = new Logger(TrafficMonitorService.name);

  private readonly LOW_REMAINING_PERCENT: number;
  private readonly NOTIFY_COOLDOWN_HOURS: number;
  private readonly BATCH_SIZE: number;
  private readonly THROTTLE_MS: number;
  private readonly ENABLED: boolean;

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private telegramNotification: TelegramNotificationService,
    private config: ConfigService,
  ) {
    this.LOW_REMAINING_PERCENT = Number(
      this.config.get('TRAFFIC_LOW_PERCENT') ?? 10,
    );
    this.NOTIFY_COOLDOWN_HOURS = Number(
      this.config.get('TRAFFIC_NOTIFY_COOLDOWN_HOURS') ?? 24,
    );
    this.BATCH_SIZE = Number(this.config.get('TRAFFIC_BATCH_SIZE') ?? 50);
    this.THROTTLE_MS = Number(this.config.get('TRAFFIC_THROTTLE_MS') ?? 250);
    this.ENABLED = this.config.get('TRAFFIC_MONITOR_ENABLED') !== 'false';

    this.logger.log(
      `📊 TrafficMonitor: ENABLED=${this.ENABLED}, low=${this.LOW_REMAINING_PERCENT}%, ` +
      `cooldown=${this.NOTIFY_COOLDOWN_HOURS}h, batch=${this.BATCH_SIZE}, throttle=${this.THROTTLE_MS}ms`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Мониторинг остатка трафика (safety net; основной путь — webhook)
  // ─────────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async monitorTrafficLevels() {
    if (!this.ENABLED) {
      this.logger.debug('TrafficMonitor отключен (TRAFFIC_MONITOR_ENABLED=false)');
      return;
    }

    this.logger.log('🔎 Запуск мониторинга остатков трафика...');

    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] },
        iccid: { not: null },
        // Не мониторим заказы-пополнения (parentOrderId != null) — они сами
        // не имеют ICCID-владения, а usage родителя проверяется отдельно.
        parentOrderId: null,
      },
      orderBy: { lastUsageAt: { sort: 'asc', nulls: 'first' } },
      take: this.BATCH_SIZE,
      include: {
        product: true,
        user: { select: { id: true, telegramId: true } },
      },
    });

    let checked = 0;
    let lowDetected = 0;
    const now = new Date();
    const cooldownMs = this.NOTIFY_COOLDOWN_HOURS * 60 * 60 * 1000;

    type LowItem = {
      orderId: string;
      country: string;
      remainingDisplay: string;
      totalDisplay: string;
      remainingPercent: number;
    };
    // Группируем низкие остатки по телеграм-id, чтобы отправить одно сообщение на юзера
    const lowByTelegramId = new Map<
      string,
      { lows: LowItem[]; orderIds: string[] }
    >();

    for (const order of orders) {
      try {
        // throttle между запросами к провайдеру
        if (checked > 0 && this.THROTTLE_MS > 0) {
          await this.sleep(this.THROTTLE_MS);
        }

        // Запрашиваем свежие данные у провайдера, игнорируя кэш (force=true).
        // Монитор запускается раз в час, поэтому нет смысла смотреть в старый кэш.
        const usage = await this.ordersService.getOrderUsage(order.id, 0, true);
        checked++;

        if (
          !usage.available ||
          usage.totalBytes === null ||
          usage.totalBytes === 0 ||
          usage.remainingBytes === null
        ) {
          // this.logger.debug(
          //   `⏭️ Пропуск ${order.id.slice(-6)}: available=${usage.available}, ` +
          //     `totalBytes=${usage.totalBytes}, usedBytes=${usage.usedBytes}, ` +
          //     `remainingBytes=${usage.remainingBytes}, reason=${(usage as any).reason ?? 'N/A'}`,
          // );
          continue;
        }

        const remainingMB = usage.remainingBytes / (1024 * 1024);
        const totalMB_dbg = usage.totalBytes / (1024 * 1024);
        const remainingPercent = (usage.remainingBytes / usage.totalBytes) * 100;
        // this.logger.debug(
        //   `📊 ${order.id.slice(-6)}: ${remainingMB.toFixed(1)}/${totalMB_dbg.toFixed(1)} MB ` +
        //   `(${remainingPercent.toFixed(1)}%), порог=${this.LOW_REMAINING_PERCENT}%`,
        // );

        // Только процентный порог. Абсолютный (MB) убран — ранние предупреждения
        // приходят через webhook DATA_USAGE от eSIM Access (80%/100% использования).
        const isLow = remainingPercent <= this.LOW_REMAINING_PERCENT;

        if (!isLow) continue;

        if (order.lowTrafficNotifiedAt) {
          const notifiedAt = new Date(order.lowTrafficNotifiedAt).getTime();
          const cooldownActive = Number.isFinite(notifiedAt) &&
            now.getTime() - notifiedAt < cooldownMs;
          if (cooldownActive) {
            // this.logger.log(
            //   `⏸️ ${order.id.slice(-6)}: low=${remainingPercent.toFixed(1)}%, cooldown ещё активен`,
            // );
            lowDetected++;
            continue;
          }
        }

        if (!order.user?.telegramId) {
          // this.logger.log(
          //   `⏸️ ${order.id.slice(-6)}: low=${remainingPercent.toFixed(1)}%, но нет telegramId`,
          // );
          lowDetected++;
          continue;
        }

        const totalMB = usage.totalBytes / (1024 * 1024);
        const totalDisplay = this.formatVolume(totalMB);
        const remainingDisplay = this.formatVolume(remainingMB);

        const tgId = order.user.telegramId.toString();
        if (!lowByTelegramId.has(tgId)) {
          lowByTelegramId.set(tgId, { lows: [], orderIds: [] });
        }
        const bucket = lowByTelegramId.get(tgId)!;
        bucket.lows.push({
          orderId: order.id,
          country: order.product.country,
          remainingDisplay,
          totalDisplay,
          remainingPercent,
        });
        bucket.orderIds.push(order.id);
        lowDetected++;
      } catch (error: any) {
        this.logger.warn(`Ошибка мониторинга заказа ${order.id}: ${error.message}`);
      }
    }

    let notified = 0;
    for (const [telegramId, { lows, orderIds }] of lowByTelegramId) {
      try {
        const text = this.buildLowTrafficMessage(lows);
        await this.telegramNotification.sendTextNotification(telegramId, text, {
          openMyEsim: true,
        });

        await this.prisma.order.updateMany({
          where: { id: { in: orderIds } },
          data: { lowTrafficNotifiedAt: now },
        });
        this.logger.log(`📨 Уведомление о низком трафике отправлено пользователю ${telegramId} (заказов: ${orderIds.length})`);
        notified++;
      } catch (error: any) {
        this.logger.warn(`Уведомление пользователю ${telegramId} не отправлено: ${error.message}`);
      }
    }

    this.logger.log(
      `🔎 Мониторинг завершён: проверено ${checked} eSIM, ` +
      `низких остатков ${lowDetected}, уведомлено пользователей ${notified}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Мониторинг истечения срока действия eSIM
  // ─────────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async monitorExpiringEsims() {
    if (!this.ENABLED) return;

    this.logger.log('⏰ Запуск мониторинга истечения сроков eSIM...');

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] },
        iccid: { not: null },
        parentOrderId: null,
        expiresAt: {
          not: null,
          gt: now,     // ещё не истекла
          lte: in24h,  // но истечёт в пределах 24ч
        },
        expiryNotifiedAt: null, // ещё не уведомляли
      },
      include: {
        product: true,
        user: { select: { id: true, telegramId: true } },
      },
    });

    if (orders.length === 0) {
      this.logger.debug('⏰ Нет eSIM, истекающих в ближайшие 24ч');
      return;
    }

    // Группируем по telegramId
    const byTelegramId = new Map<
      string,
      { items: Array<{ orderId: string; country: string; expiresAt: Date }>; orderIds: string[] }
    >();

    for (const order of orders) {
      if (!order.user?.telegramId || !order.expiresAt) continue;

      const tgId = order.user.telegramId.toString();
      if (!byTelegramId.has(tgId)) {
        byTelegramId.set(tgId, { items: [], orderIds: [] });
      }
      const bucket = byTelegramId.get(tgId)!;
      bucket.items.push({
        orderId: order.id,
        country: order.product.country,
        expiresAt: order.expiresAt,
      });
      bucket.orderIds.push(order.id);
    }

    let notified = 0;
    for (const [telegramId, { items, orderIds }] of byTelegramId) {
      try {
        const text = this.buildExpiryMessage(items);
        await this.telegramNotification.sendTextNotification(telegramId, text, {
          openMyEsim: true,
        });

        await this.prisma.order.updateMany({
          where: { id: { in: orderIds } },
          data: { expiryNotifiedAt: new Date() },
        });
        notified++;
      } catch (error: any) {
        this.logger.warn(`Уведомление об истечении для ${telegramId} не отправлено: ${error.message}`);
      }
    }

    this.logger.log(
      `⏰ Мониторинг истечений завершён: ${orders.length} eSIM, уведомлено пользователей ${notified}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Построение текстов уведомлений
  // ─────────────────────────────────────────────────────────────────────

  private buildLowTrafficMessage(
    lows: Array<{
      country: string;
      remainingDisplay: string;
      totalDisplay: string;
      remainingPercent: number;
    }>,
  ): string {
    if (lows.length === 1) {
      const l = lows[0];
      return (
        `⚠️ <b>Низкий остаток трафика</b>\n\n` +
        `🌍 ${l.country}\n` +
        `📉 Осталось: <b>${l.remainingDisplay}</b> из ${l.totalDisplay} ` +
        `(${l.remainingPercent.toFixed(0)}%)\n\n` +
        `Можно пополнить прямо в приложении.`
      );
    }
    const lines = lows.map(
      (l) =>
        `• 🌍 <b>${l.country}</b>: ${l.remainingDisplay} из ${l.totalDisplay} ` +
        `(${l.remainingPercent.toFixed(0)}%)`,
    );
    return (
      `⚠️ <b>Низкий остаток трафика</b>\n\n` +
      `На ${lows.length} ваших eSIM осталось мало трафика:\n\n` +
      lines.join('\n') +
      `\n\nМожно пополнить любую из них прямо в приложении.`
    );
  }

  private buildExpiryMessage(
    items: Array<{ country: string; expiresAt: Date }>,
  ): string {
    if (items.length === 1) {
      const item = items[0];
      const hoursLeft = Math.max(0, Math.floor((item.expiresAt.getTime() - Date.now()) / 3600000));
      return (
        `⏰ <b>eSIM скоро истекает</b>\n\n` +
        `🌍 ${item.country}\n` +
        `⏳ Осталось: <b>${hoursLeft} ч.</b>\n\n` +
        `Можно продлить прямо в приложении.`
      );
    }
    const lines = items.map((item) => {
      const hoursLeft = Math.max(0, Math.floor((item.expiresAt.getTime() - Date.now()) / 3600000));
      return `• 🌍 <b>${item.country}</b>: осталось ${hoursLeft} ч.`;
    });
    return (
      `⏰ <b>eSIM скоро истекают</b>\n\n` +
      `У ${items.length} ваших eSIM истекает срок действия:\n\n` +
      lines.join('\n') +
      `\n\nМожно продлить любую из них прямо в приложении.`
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Утилиты
  // ─────────────────────────────────────────────────────────────────────

  private formatVolume(mb: number): string {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} ГБ`;
    return `${Math.round(mb)} МБ`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
