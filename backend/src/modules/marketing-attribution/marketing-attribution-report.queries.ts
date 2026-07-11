import { MarketingTouchChannel, Prisma } from '@prisma/client';
import type {
  MarketingAttributionModel,
  MarketingAttributionOrderSource,
} from '@shared/marketing-attribution-report';

export type ResolvedMarketingAttributionReportFilters = {
  dateFrom: string;
  dateTo: string;
  from: Date;
  toExclusive: Date;
  channel: MarketingTouchChannel | null;
  model: MarketingAttributionModel;
};

export type AttributionReportDbRow = {
  campaignId: string | null;
  shortCode: string | null;
  name: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  isActive: boolean | null;
  deactivatedAt: Date | null;
  clicks: bigint | number;
  registrations: bigint | number;
  firstPurchases: bigint | number;
  repeatPurchases: bigint | number;
  revenue: Prisma.Decimal | number | string | null;
};

export type CpaReportDbRow = {
  campaignId: string;
  shortCode: string;
  name: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  referralLinkId: string;
  referralCode: string;
  referralLabel: string | null;
  partnerUserId: string;
  partnerFirstName: string | null;
  partnerLastName: string | null;
  partnerUsername: string | null;
  partnerReferralCode: string;
  firstPurchases: bigint | number;
  repeatPurchases: bigint | number;
  revenue: Prisma.Decimal | number | string | null;
  payoutMode: 'BALANCE' | 'EXTERNAL' | 'UNKNOWN' | null;
  rewardsCount: bigint | number;
  payout: Prisma.Decimal | number | string | null;
};

export type AttributionOrderDetailsDataDbRow = {
  orderId: string;
  userId: string;
  userFirstName: string | null;
  userLastName: string | null;
  userUsername: string | null;
  userEmail: string | null;
  productName: string | null;
  productCountry: string | null;
  completedAt: Date;
  totalAmount: Prisma.Decimal | number | string;
  purchaseSequence: bigint | number;
};

type EmptyAttributionOrderDetailsDbRow = {
  [Field in keyof AttributionOrderDetailsDataDbRow]: null;
};

export type AttributionOrderDetailsDbRow = (
  | AttributionOrderDetailsDataDbRow
  | EmptyAttributionOrderDetailsDbRow
) & {
  totalCount: bigint | number;
};

export type ResolvedAttributionOrderDetailsQuery = {
  filters: ResolvedMarketingAttributionReportFilters;
  source: MarketingAttributionOrderSource;
  campaignId: string | null;
  page: number;
  limit: number;
  offset: number;
};

type SnapshotColumns = {
  registrationCampaign: Prisma.Sql;
  registrationChannel: Prisma.Sql;
  orderCampaign: Prisma.Sql;
  orderChannel: Prisma.Sql;
};

function snapshotColumns(
  filters: ResolvedMarketingAttributionReportFilters,
): SnapshotColumns {
  if (filters.model === 'FIRST_TOUCH') {
    return {
      registrationCampaign: Prisma.raw('uma."registrationFirstCampaignId"'),
      registrationChannel: Prisma.raw('uma."registrationFirstChannel"'),
      orderCampaign: Prisma.raw('oma."firstCampaignId"'),
      orderChannel: Prisma.raw('oma."firstChannel"'),
    };
  }

  return {
    registrationCampaign: Prisma.raw('uma."registrationLastCampaignId"'),
    registrationChannel: Prisma.raw('uma."registrationLastChannel"'),
    orderCampaign: Prisma.raw('oma."lastCampaignId"'),
    orderChannel: Prisma.raw('oma."lastChannel"'),
  };
}

function channelPredicate(column: Prisma.Sql, channel: string | null): Prisma.Sql {
  return channel ? Prisma.sql`AND ${column}::text = ${channel}` : Prisma.empty;
}

function rankedPrimaryOrdersCte(): Prisma.Sql {
  return Prisma.sql`
    ranked_primary_orders AS (
      SELECT o.id,
             o."userId",
             o."completedAt",
             o."totalAmount",
             ROW_NUMBER() OVER (
               PARTITION BY o."userId"
               ORDER BY o."completedAt", o.id
             ) AS purchase_sequence
      FROM orders o
      WHERE o.status = 'COMPLETED'
        AND o."parentOrderId" IS NULL
        AND o."completedAt" IS NOT NULL
    )
  `;
}

function selectedCpaOrdersCte(
  filters: ResolvedMarketingAttributionReportFilters,
  columns: SnapshotColumns,
): Prisma.Sql {
  return Prisma.sql`
    ${rankedPrimaryOrdersCte()},
    selected_orders AS (
      SELECT rpo.id AS "orderId",
             rpo."totalAmount",
             rpo.purchase_sequence,
             ${columns.orderCampaign} AS "campaignId"
      FROM ranked_primary_orders rpo
      JOIN order_marketing_attribution oma ON oma."orderId" = rpo.id
      JOIN marketing_campaigns mc ON mc.id = ${columns.orderCampaign}
      WHERE rpo."completedAt" >= ${filters.from}
        AND rpo."completedAt" < ${filters.toExclusive}
        AND mc."referralLinkId" IS NOT NULL
        ${channelPredicate(columns.orderChannel, filters.channel)}
    )
  `;
}

function attributionOrderSourcePredicate(
  orderCampaign: Prisma.Sql,
  source: MarketingAttributionOrderSource,
  campaignId: string | null,
): Prisma.Sql {
  return source === 'DIRECT'
    ? Prisma.sql`${orderCampaign} IS NULL`
    : Prisma.sql`${orderCampaign} = ${campaignId}`;
}

export function buildAttributionReportQuery(
  filters: ResolvedMarketingAttributionReportFilters,
): Prisma.Sql {
  const columns = snapshotColumns(filters);

  return Prisma.sql`
    WITH ${rankedPrimaryOrdersCte()},
    facts AS (
      SELECT mt."campaignId" AS "campaignId",
             COUNT(*)::bigint AS clicks,
             0::bigint AS registrations,
             0::bigint AS "firstPurchases",
             0::bigint AS "repeatPurchases",
             0::numeric AS revenue
      FROM marketing_touches mt
      WHERE mt."occurredAt" >= ${filters.from}
        AND mt."occurredAt" < ${filters.toExclusive}
        ${channelPredicate(Prisma.raw('mt.channel'), filters.channel)}
      GROUP BY mt."campaignId"

      UNION ALL

      SELECT ${columns.registrationCampaign} AS "campaignId",
             0::bigint AS clicks,
             COUNT(*)::bigint AS registrations,
             0::bigint AS "firstPurchases",
             0::bigint AS "repeatPurchases",
             0::numeric AS revenue
      FROM user_marketing_attribution uma
      WHERE uma."registrationStatus" IN ('DIRECT', 'ATTRIBUTED')
        AND uma."registrationFinalizedAt" >= ${filters.from}
        AND uma."registrationFinalizedAt" < ${filters.toExclusive}
        ${channelPredicate(columns.registrationChannel, filters.channel)}
      GROUP BY ${columns.registrationCampaign}

      UNION ALL

      SELECT ${columns.orderCampaign} AS "campaignId",
             0::bigint AS clicks,
             0::bigint AS registrations,
             COUNT(*) FILTER (WHERE rpo.purchase_sequence = 1)::bigint AS "firstPurchases",
             COUNT(*) FILTER (WHERE rpo.purchase_sequence > 1)::bigint AS "repeatPurchases",
             COALESCE(SUM(rpo."totalAmount"), 0)::numeric AS revenue
      FROM ranked_primary_orders rpo
      JOIN order_marketing_attribution oma ON oma."orderId" = rpo.id
      WHERE rpo."completedAt" >= ${filters.from}
        AND rpo."completedAt" < ${filters.toExclusive}
        ${channelPredicate(columns.orderChannel, filters.channel)}
      GROUP BY ${columns.orderCampaign}
    )
    SELECT facts."campaignId" AS "campaignId",
           mc."shortCode" AS "shortCode",
           mc.name,
           mc."utmSource" AS "utmSource",
           mc."utmMedium" AS "utmMedium",
           mc."utmCampaign" AS "utmCampaign",
           mc."isActive" AS "isActive",
           mc."deactivatedAt" AS "deactivatedAt",
           SUM(facts.clicks)::bigint AS clicks,
           SUM(facts.registrations)::bigint AS registrations,
           SUM(facts."firstPurchases")::bigint AS "firstPurchases",
           SUM(facts."repeatPurchases")::bigint AS "repeatPurchases",
           SUM(facts.revenue)::numeric AS revenue
    FROM facts
    LEFT JOIN marketing_campaigns mc ON mc.id = facts."campaignId"
    GROUP BY facts."campaignId", mc."shortCode", mc.name, mc."utmSource",
             mc."utmMedium", mc."utmCampaign", mc."isActive", mc."deactivatedAt"
    ORDER BY CASE WHEN facts."campaignId" IS NULL THEN 1 ELSE 0 END,
             SUM(facts.revenue) DESC,
             mc.name ASC,
             facts."campaignId" ASC
  `;
}

export function buildAttributionOrderDetailsQuery(
  query: ResolvedAttributionOrderDetailsQuery,
): Prisma.Sql {
  const { filters, source, campaignId, limit, offset } = query;
  const columns = snapshotColumns(filters);

  return Prisma.sql`
    WITH selected_orders AS MATERIALIZED (
      SELECT order_record.id AS "orderId",
             order_record."userId" AS "userId",
             order_record."completedAt" AS "completedAt",
             order_record."totalAmount" AS "totalAmount"
      FROM orders order_record
      JOIN order_marketing_attribution oma ON oma."orderId" = order_record.id
      WHERE order_record.status = 'COMPLETED'
        AND order_record."parentOrderId" IS NULL
        AND order_record."completedAt" IS NOT NULL
        AND order_record."completedAt" >= ${filters.from}
        AND order_record."completedAt" < ${filters.toExclusive}
        AND ${attributionOrderSourcePredicate(columns.orderCampaign, source, campaignId)}
        ${channelPredicate(columns.orderChannel, filters.channel)}
    ),
    matching_count AS (
      SELECT COUNT(*)::bigint AS "totalCount"
      FROM selected_orders
    ),
    page_orders AS MATERIALIZED (
      SELECT *
      FROM selected_orders
      ORDER BY "completedAt" DESC, "orderId" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    ),
    page_user_sequences AS (
      SELECT history.id AS "orderId",
             ROW_NUMBER() OVER (
               PARTITION BY history."userId"
               ORDER BY history."completedAt", history.id
             ) AS "purchaseSequence"
      FROM orders history
      JOIN (
        SELECT DISTINCT "userId"
        FROM page_orders
      ) page_users ON page_users."userId" = history."userId"
      WHERE history.status = 'COMPLETED'
        AND history."parentOrderId" IS NULL
        AND history."completedAt" IS NOT NULL
    )
    SELECT page_orders."orderId" AS "orderId",
           page_orders."userId" AS "userId",
           user_record."firstName" AS "userFirstName",
           user_record."lastName" AS "userLastName",
           user_record.username AS "userUsername",
           user_record.email AS "userEmail",
           product.name AS "productName",
           product.country AS "productCountry",
           page_orders."completedAt" AS "completedAt",
           page_orders."totalAmount" AS "totalAmount",
           page_user_sequences."purchaseSequence" AS "purchaseSequence",
           matching_count."totalCount" AS "totalCount"
    FROM matching_count
    LEFT JOIN page_orders ON TRUE
    LEFT JOIN page_user_sequences ON page_user_sequences."orderId" = page_orders."orderId"
    LEFT JOIN users user_record ON user_record.id = page_orders."userId"
    LEFT JOIN orders order_record ON order_record.id = page_orders."orderId"
    LEFT JOIN esim_products product ON product.id = order_record."productId"
    ORDER BY page_orders."completedAt" DESC, page_orders."orderId" DESC
  `;
}

export function buildCpaReportQuery(
  filters: ResolvedMarketingAttributionReportFilters,
): Prisma.Sql {
  const columns = snapshotColumns(filters);

  return Prisma.sql`
    WITH ${selectedCpaOrdersCte(filters, columns)},
    order_totals AS (
      SELECT so."campaignId",
             COUNT(*) FILTER (WHERE so.purchase_sequence = 1)::bigint AS "firstPurchases",
             COUNT(*) FILTER (WHERE so.purchase_sequence > 1)::bigint AS "repeatPurchases",
             COALESCE(SUM(so."totalAmount"), 0)::numeric AS revenue
      FROM selected_orders so
      GROUP BY so."campaignId"
    ),
    payout_splits AS (
      SELECT so."campaignId",
             CASE
               WHEN t.metadata->>'payoutMode' IN ('BALANCE', 'EXTERNAL')
                 THEN t.metadata->>'payoutMode'
               ELSE 'UNKNOWN'
             END AS "payoutMode",
             COUNT(t.id)::bigint AS "rewardsCount",
             COALESCE(SUM(t.amount), 0)::numeric AS payout
      FROM selected_orders so
      JOIN marketing_campaigns mc ON mc.id = so."campaignId"
      JOIN transactions t
        ON t."orderId" = so."orderId"
       AND t."referralLinkId" = mc."referralLinkId"
       AND t.type = 'REFERRAL_BONUS'
       AND t.status = 'SUCCEEDED'
      GROUP BY so."campaignId", "payoutMode"
    )
    SELECT mc.id AS "campaignId",
           mc."shortCode" AS "shortCode",
           mc.name,
           mc."isActive" AS "isActive",
           mc."deactivatedAt" AS "deactivatedAt",
           rl.id AS "referralLinkId",
           rl.code AS "referralCode",
           rl.label AS "referralLabel",
           partner.id AS "partnerUserId",
           partner."firstName" AS "partnerFirstName",
           partner."lastName" AS "partnerLastName",
           partner.username AS "partnerUsername",
           partner."referralCode" AS "partnerReferralCode",
           COALESCE(ot."firstPurchases", 0)::bigint AS "firstPurchases",
           COALESCE(ot."repeatPurchases", 0)::bigint AS "repeatPurchases",
           COALESCE(ot.revenue, 0)::numeric AS revenue,
           ps."payoutMode" AS "payoutMode",
           COALESCE(ps."rewardsCount", 0)::bigint AS "rewardsCount",
           COALESCE(ps.payout, 0)::numeric AS payout
    FROM marketing_campaigns mc
    JOIN referral_links rl ON rl.id = mc."referralLinkId"
    JOIN users partner ON partner.id = rl."userId"
    LEFT JOIN order_totals ot ON ot."campaignId" = mc.id
    LEFT JOIN payout_splits ps ON ps."campaignId" = mc.id
    WHERE mc."referralLinkId" IS NOT NULL
    ORDER BY mc.name ASC, mc.id ASC, ps."payoutMode" ASC
  `;
}
