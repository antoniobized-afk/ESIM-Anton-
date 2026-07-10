import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  getDefaultMarketingReportDateRange,
  MARKETING_ATTRIBUTION_DEFAULT_MODEL,
  MARKETING_REPORT_MAX_RANGE_DAYS,
  parseUtcDateOnly,
} from '@shared/marketing-attribution-report';
import {
  MarketingAttributionReportQueryDto,
} from './dto/marketing-attribution-report-query.dto';
import {
  type AttributionReportDbRow,
  buildAttributionReportQuery,
  buildCpaReportQuery,
  type CpaReportDbRow,
  type ResolvedMarketingAttributionReportFilters,
} from './marketing-attribution-report.queries';

type CpaPayoutSplit = {
  payoutMode: Exclude<CpaReportDbRow['payoutMode'], null>;
  rewardsCount: number;
  payout: Prisma.Decimal;
};

const REPORT_SEMANTICS = {
  timezone: 'UTC',
  interval: '[dateFrom 00:00, dateTo + 1 day 00:00)',
  clicksDateField: 'MarketingTouch.occurredAt',
  registrationsDateField: 'UserMarketingAttribution.registrationFinalizedAt',
  purchasesDateField: 'Order.completedAt',
  note: 'Метрики используют разные event-time поля; межэтапные conversion ratios не рассчитываются.',
} as const;

@Injectable()
export class MarketingAttributionReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getAttributionReport(query: MarketingAttributionReportQueryDto = {}) {
    const filters = this.resolveFilters(query);
    const rows = await this.prisma.$queryRaw<AttributionReportDbRow[]>(
      buildAttributionReportQuery(filters),
    );
    const mappedRows = rows.map((row) => this.mapAttributionRow(row));

    return {
      filters: this.publicFilters(filters),
      semantics: REPORT_SEMANTICS,
      totals: mappedRows.reduce(
        (totals, row) => ({
          clicks: totals.clicks + row.metrics.clicks,
          registrations: totals.registrations + row.metrics.registrations,
          firstPurchases: totals.firstPurchases + row.metrics.firstPurchases,
          repeatPurchases: totals.repeatPurchases + row.metrics.repeatPurchases,
          purchases: totals.purchases + row.metrics.purchases,
          revenue: totals.revenue.add(row.metrics.revenue),
        }),
        {
          clicks: 0,
          registrations: 0,
          firstPurchases: 0,
          repeatPurchases: 0,
          purchases: 0,
          revenue: new Prisma.Decimal(0),
        },
      ),
      rows: mappedRows,
    };
  }

  async getCpaReport(query: MarketingAttributionReportQueryDto = {}) {
    const filters = this.resolveFilters(query);
    const rows = await this.prisma.$queryRaw<CpaReportDbRow[]>(buildCpaReportQuery(filters));
    const mappedRows = this.groupCpaRows(rows)
      .map(({ row, payoutModeSplit }) => this.mapCpaRow(row, payoutModeSplit))
      .sort((left, right) => this.compareCpaRows(left, right));

    return {
      filters: this.publicFilters(filters),
      semantics: {
        ...REPORT_SEMANTICS,
        payoutSource: 'Successful REFERRAL_BONUS ledger matched by orderId and referralLinkId',
      },
      totals: mappedRows.reduce(
        (totals, row) => ({
          firstPurchases: totals.firstPurchases + row.metrics.firstPurchases,
          repeatPurchases: totals.repeatPurchases + row.metrics.repeatPurchases,
          purchases: totals.purchases + row.metrics.purchases,
          revenue: totals.revenue.add(row.metrics.revenue),
          rewardsCount: totals.rewardsCount + row.metrics.rewardsCount,
          payout: totals.payout.add(row.metrics.payout),
        }),
        {
          firstPurchases: 0,
          repeatPurchases: 0,
          purchases: 0,
          revenue: new Prisma.Decimal(0),
          rewardsCount: 0,
          payout: new Prisma.Decimal(0),
        },
      ),
      rows: mappedRows,
    };
  }

  resolveFilters(
    query: MarketingAttributionReportQueryDto = {},
  ): ResolvedMarketingAttributionReportFilters {
    if ((query.dateFrom && !query.dateTo) || (!query.dateFrom && query.dateTo)) {
      throw new BadRequestException('dateFrom и dateTo должны передаваться вместе');
    }

    const defaultDates = getDefaultMarketingReportDateRange();
    const dateFrom = query.dateFrom ?? defaultDates.dateFrom;
    const dateTo = query.dateTo ?? defaultDates.dateTo;
    const from = this.dateAtUtcStart(dateFrom);
    const to = this.dateAtUtcStart(dateTo);

    if (from > to) {
      throw new BadRequestException('dateFrom не может быть позже dateTo');
    }

    const rangeDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (rangeDays > MARKETING_REPORT_MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Период отчёта не может превышать ${MARKETING_REPORT_MAX_RANGE_DAYS} дней`,
      );
    }

    const toExclusive = new Date(to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    return {
      dateFrom,
      dateTo,
      from,
      toExclusive,
      channel: query.channel ?? null,
      model: query.model ?? MARKETING_ATTRIBUTION_DEFAULT_MODEL,
    };
  }

  private publicFilters(filters: ResolvedMarketingAttributionReportFilters) {
    return {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      channel: filters.channel,
      model: filters.model,
    };
  }

  private mapAttributionRow(row: AttributionReportDbRow) {
    const firstPurchases = this.count(row.firstPurchases);
    const repeatPurchases = this.count(row.repeatPurchases);

    return {
      campaign: row.campaignId
        ? {
            id: row.campaignId,
            shortCode: row.shortCode,
            name: row.name,
            utmSource: row.utmSource,
            utmMedium: row.utmMedium,
            utmCampaign: row.utmCampaign,
            isActive: row.isActive,
            deactivatedAt: row.deactivatedAt,
          }
        : null,
      metrics: {
        clicks: this.count(row.clicks),
        registrations: this.count(row.registrations),
        firstPurchases,
        repeatPurchases,
        purchases: firstPurchases + repeatPurchases,
        revenue: this.money(row.revenue),
      },
    };
  }

  private mapCpaRow(
    row: CpaReportDbRow,
    payoutModeSplit: CpaPayoutSplit[],
  ) {
    const firstPurchases = this.count(row.firstPurchases);
    const repeatPurchases = this.count(row.repeatPurchases);
    const rewardsCount = payoutModeSplit.reduce(
      (total, split) => total + split.rewardsCount,
      0,
    );
    const payout = payoutModeSplit.reduce(
      (total, split) => total.add(split.payout),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);

    return {
      campaign: {
        id: row.campaignId,
        shortCode: row.shortCode,
        name: row.name,
        isActive: row.isActive,
        deactivatedAt: row.deactivatedAt,
      },
      referralLink: {
        id: row.referralLinkId,
        code: row.referralCode,
        label: row.referralLabel,
      },
      partner: {
        userId: row.partnerUserId,
        firstName: row.partnerFirstName,
        lastName: row.partnerLastName,
        username: row.partnerUsername,
        referralCode: row.partnerReferralCode,
      },
      metrics: {
        firstPurchases,
        repeatPurchases,
        purchases: firstPurchases + repeatPurchases,
        revenue: this.money(row.revenue),
        rewardsCount,
        payout,
        actualCpa: rewardsCount > 0 ? payout.div(rewardsCount).toDecimalPlaces(2) : null,
      },
      payoutModeSplit,
    };
  }

  private groupCpaRows(rows: CpaReportDbRow[]) {
    const result = new Map<string, { row: CpaReportDbRow; payoutModeSplit: CpaPayoutSplit[] }>();

    rows.forEach((row) => {
      const campaign = result.get(row.campaignId) ?? { row, payoutModeSplit: [] };
      if (row.payoutMode) {
        campaign.payoutModeSplit.push({
          payoutMode: row.payoutMode,
          rewardsCount: this.count(row.rewardsCount),
          payout: this.money(row.payout),
        });
      }
      result.set(row.campaignId, campaign);
    });

    return [...result.values()];
  }

  private compareCpaRows(
    left: { campaign: { id: string; name: string }; metrics: { payout: Prisma.Decimal } },
    right: { campaign: { id: string; name: string }; metrics: { payout: Prisma.Decimal } },
  ) {
    const payoutOrder = right.metrics.payout.comparedTo(left.metrics.payout);
    if (payoutOrder !== 0) return payoutOrder;

    const nameOrder = left.campaign.name.localeCompare(right.campaign.name, 'ru');
    return nameOrder !== 0 ? nameOrder : left.campaign.id.localeCompare(right.campaign.id);
  }

  private dateAtUtcStart(value: string) {
    const date = parseUtcDateOnly(value);
    if (!date) {
      throw new BadRequestException('Дата должна быть существующей датой в формате YYYY-MM-DD');
    }
    return date;
  }

  private count(value: bigint | number) {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Отчёт вернул некорректное количество фактов');
    }
    return count;
  }

  private money(value: Prisma.Decimal | number | string | null) {
    return new Prisma.Decimal(value ?? 0).toDecimalPlaces(2);
  }
}
