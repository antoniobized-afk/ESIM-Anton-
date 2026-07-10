import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarketingCampaign,
  MarketingCampaignAuditEvent,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CreateMarketingCampaignDto } from './dto/create-marketing-campaign.dto';
import { MarketingCampaignsQueryDto } from './dto/marketing-campaigns-query.dto';
import { UpdateMarketingCampaignDto } from './dto/update-marketing-campaign.dto';
import { MarketingCampaignActor } from './marketing-attribution.types';

type CampaignUpdate = UpdateMarketingCampaignDto;

type CampaignLinkConfig = {
  siteUrl: URL;
  botUsername: string;
};

type CampaignWithRelations = Prisma.MarketingCampaignGetPayload<{
  include: {
    referralLink: {
      select: { id: true; code: true; label: true; userId: true; isActive: true };
    };
    _count: { select: { touches: true } };
  };
}>;

const MANAGE_CAMPAIGN_ROLES = new Set(['MANAGER', 'SUPER_ADMIN']);
const SHORT_CODE_LENGTH = 12;
const MAX_SHORT_CODE_ATTEMPTS = 5;

@Injectable()
export class MarketingCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createCampaign(dto: CreateMarketingCampaignDto, actor: MarketingCampaignActor) {
    this.assertCanManage(actor);
    const data = this.normalizeCreate(dto);
    const linkConfig = this.resolveLinkConfig();
    await this.assertReferralLinkExists(data.referralLinkId);

    for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const created = await tx.marketingCampaign.create({
            data: {
              ...data,
              shortCode: this.generateShortCode(),
            },
            include: this.campaignInclude(),
          });

          await tx.marketingCampaignAudit.create({
            data: {
              campaignId: created.id,
              event: MarketingCampaignAuditEvent.CREATED,
              actorId: actor.id,
              actorRole: actor.role as 'MANAGER' | 'SUPER_ADMIN',
              after: this.auditSnapshot(created),
            },
          });

          return this.serializeCampaign(created, linkConfig);
        });
      } catch (error) {
        if (this.isShortCodeConflict(error)) {
          if (attempt < MAX_SHORT_CODE_ATTEMPTS - 1) {
            continue;
          }
          throw new ConflictException('Не удалось сгенерировать уникальный код кампании');
        }
        throw error;
      }
    }
  }

  async getCampaigns(query: MarketingCampaignsQueryDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(query.limit ?? 20, 100));
    const where: Prisma.MarketingCampaignWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    };

    const [data, total] = await Promise.all([
      this.prisma.marketingCampaign.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.campaignInclude(),
      }),
      this.prisma.marketingCampaign.count({ where }),
    ]);
    const linkConfig = this.resolveLinkConfig();

    return {
      data: data.map((campaign) => this.serializeCampaign(campaign, linkConfig)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.marketingCampaign.findUnique({
      where: { id },
      include: this.campaignInclude(),
    });

    if (!campaign) {
      throw new NotFoundException('Маркетинговая кампания не найдена');
    }

    return this.serializeCampaign(campaign);
  }

  async updateCampaign(
    id: string,
    dto: UpdateMarketingCampaignDto,
    actor: MarketingCampaignActor,
  ) {
    this.assertCanManage(actor);
    const update = this.normalizeUpdate(dto);
    const linkConfig = this.resolveLinkConfig();
    await this.assertReferralLinkExists(update.referralLinkId, dto.referralLinkId !== undefined);

    return this.prisma.$transaction(async (tx) => {
      // Тот же row lock берёт capture: freeze/deactivation получают единый порядок.
      await tx.$queryRaw`SELECT "id" FROM "marketing_campaigns" WHERE "id" = ${id} FOR UPDATE`;

      const existing = await tx.marketingCampaign.findUnique({
        where: { id },
        include: this.campaignInclude(),
      });

      if (!existing) {
        throw new NotFoundException('Маркетинговая кампания не найдена');
      }

      this.assertMutableFields(existing, update);
      const data = this.buildUpdateData(existing, update);

      if (Object.keys(data).length === 0) {
        return this.serializeCampaign(existing, linkConfig);
      }

      const updated = await tx.marketingCampaign.update({
        where: { id },
        data,
        include: this.campaignInclude(),
      });

      await tx.marketingCampaignAudit.create({
        data: {
          campaignId: updated.id,
          event: this.auditEvent(existing, updated),
          actorId: actor.id,
          actorRole: actor.role as 'MANAGER' | 'SUPER_ADMIN',
          before: this.auditSnapshot(existing),
          after: this.auditSnapshot(updated),
        },
      });

      return this.serializeCampaign(updated, linkConfig);
    });
  }

  async findActiveCampaignByCode(shortCode: string) {
    const normalizedCode = this.normalizeShortCode(shortCode);
    return this.prisma.marketingCampaign.findFirst({
      where: { shortCode: normalizedCode, isActive: true },
    });
  }

  private campaignInclude() {
    return {
      referralLink: {
        select: { id: true, code: true, label: true, userId: true, isActive: true },
      },
      _count: { select: { touches: true } },
    } as const;
  }

  private assertCanManage(actor: MarketingCampaignActor): asserts actor is MarketingCampaignActor & {
    role: 'MANAGER' | 'SUPER_ADMIN';
  } {
    if (!MANAGE_CAMPAIGN_ROLES.has(actor.role ?? '')) {
      throw new ForbiddenException('У этой роли нет права изменять маркетинговые кампании');
    }
  }

  private normalizeCreate(dto: CreateMarketingCampaignDto) {
    return {
      name: this.requiredText(dto.name, 'name', 120),
      utmSource: this.requiredText(dto.utmSource, 'utmSource', 160),
      utmMedium: this.requiredText(dto.utmMedium, 'utmMedium', 160),
      utmCampaign: this.requiredText(dto.utmCampaign, 'utmCampaign', 160),
      utmContent: this.optionalText(dto.utmContent, 'utmContent', 160),
      utmTerm: this.optionalText(dto.utmTerm, 'utmTerm', 160),
      targetPath: this.normalizeTargetPath(dto.targetPath),
      referralLinkId: this.normalizeReferralLinkId(dto.referralLinkId) ?? null,
    };
  }

  private normalizeUpdate(dto: UpdateMarketingCampaignDto): CampaignUpdate {
    return {
      ...(dto.name === undefined ? {} : { name: this.requiredText(dto.name, 'name', 120) }),
      ...(dto.utmSource === undefined
        ? {}
        : { utmSource: this.requiredText(dto.utmSource, 'utmSource', 160) }),
      ...(dto.utmMedium === undefined
        ? {}
        : { utmMedium: this.requiredText(dto.utmMedium, 'utmMedium', 160) }),
      ...(dto.utmCampaign === undefined
        ? {}
        : { utmCampaign: this.requiredText(dto.utmCampaign, 'utmCampaign', 160) }),
      ...(dto.utmContent === undefined
        ? {}
        : { utmContent: this.optionalText(dto.utmContent, 'utmContent', 160) }),
      ...(dto.utmTerm === undefined
        ? {}
        : { utmTerm: this.optionalText(dto.utmTerm, 'utmTerm', 160) }),
      ...(dto.targetPath === undefined ? {} : { targetPath: this.normalizeTargetPath(dto.targetPath) }),
      ...(dto.referralLinkId === undefined
        ? {}
        : { referralLinkId: this.normalizeReferralLinkId(dto.referralLinkId) }),
      ...(dto.isActive === undefined
        ? {}
        : { isActive: this.requiredBoolean(dto.isActive, 'isActive') }),
    };
  }

  private requiredText(value: string, field: string, maxLength: number) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`${field} не может быть пустым`);
    }
    if (normalized.length > maxLength) {
      throw new BadRequestException(`${field} не должен быть длиннее ${maxLength} символов`);
    }
    return normalized;
  }

  private requiredBoolean(value: unknown, field: string) {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} должен быть логическим значением`);
    }

    return value;
  }

  private optionalText(value: string | null | undefined, field: string, maxLength: number) {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (normalized.length > maxLength) {
      throw new BadRequestException(`${field} не должен быть длиннее ${maxLength} символов`);
    }
    return normalized;
  }

  private normalizeTargetPath(value: string) {
    const path = this.requiredText(value, 'targetPath', 512);
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new BadRequestException('targetPath должен быть безопасным относительным путём');
    }

    const base = new URL('https://marketing-path.invalid');
    const resolved = new URL(path, base);
    if (resolved.origin !== base.origin) {
      throw new BadRequestException('targetPath не может указывать на внешний URL');
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  }

  private normalizeShortCode(value: string) {
    const code = value.trim();
    if (!/^[A-Za-z0-9_-]{8,32}$/.test(code)) {
      throw new BadRequestException('Некорректный код маркетинговой кампании');
    }
    return code;
  }

  private normalizeReferralLinkId(value: string | null | undefined) {
    if (value === undefined || value === null) {
      return value;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('referralLinkId должен быть непустым идентификатором');
    }

    const referralLinkId = value.trim();
    if (!referralLinkId) {
      throw new BadRequestException('referralLinkId должен быть непустым идентификатором');
    }

    return referralLinkId;
  }

  private async assertReferralLinkExists(referralLinkId: string | null | undefined, isUpdating = false) {
    if (referralLinkId === undefined || referralLinkId === null) {
      return;
    }

    const referralLink = await this.prisma.referralLink.findUnique({
      where: { id: referralLinkId },
      select: { id: true },
    });

    if (!referralLink) {
      throw new NotFoundException(
        isUpdating ? 'Новая referral link не найдена' : 'Referral link не найдена',
      );
    }
  }

  private assertMutableFields(existing: CampaignWithRelations, update: CampaignUpdate) {
    if (existing._count.touches === 0) {
      return;
    }

    const frozenFields: Array<keyof CampaignUpdate> = [
      'utmSource',
      'utmMedium',
      'utmCampaign',
      'utmContent',
      'utmTerm',
      'targetPath',
      'referralLinkId',
    ];
    const attemptedFrozenChange = frozenFields.some(
      (field) => update[field] !== undefined && update[field] !== existing[field],
    );

    if (attemptedFrozenChange) {
      throw new ConflictException(
        'После первого касания нельзя менять UTM, targetPath или связанную referral link кампании',
      );
    }
  }

  private buildUpdateData(existing: CampaignWithRelations, update: CampaignUpdate) {
    const data: Prisma.MarketingCampaignUpdateInput = {};

    if (update.name !== undefined && update.name !== existing.name) data.name = update.name;
    if (update.utmSource !== undefined && update.utmSource !== existing.utmSource) {
      data.utmSource = update.utmSource;
    }
    if (update.utmMedium !== undefined && update.utmMedium !== existing.utmMedium) {
      data.utmMedium = update.utmMedium;
    }
    if (update.utmCampaign !== undefined && update.utmCampaign !== existing.utmCampaign) {
      data.utmCampaign = update.utmCampaign;
    }
    if (update.utmContent !== undefined && update.utmContent !== existing.utmContent) {
      data.utmContent = update.utmContent;
    }
    if (update.utmTerm !== undefined && update.utmTerm !== existing.utmTerm) {
      data.utmTerm = update.utmTerm;
    }
    if (update.targetPath !== undefined && update.targetPath !== existing.targetPath) {
      data.targetPath = update.targetPath;
    }
    if (update.referralLinkId !== undefined && update.referralLinkId !== existing.referralLinkId) {
      data.referralLink = update.referralLinkId
        ? { connect: { id: update.referralLinkId } }
        : { disconnect: true };
    }
    if (update.isActive !== undefined && update.isActive !== existing.isActive) {
      data.isActive = update.isActive;
      data.deactivatedAt = update.isActive ? null : new Date();
    }

    return data;
  }

  private auditEvent(
    before: CampaignWithRelations,
    after: CampaignWithRelations,
  ): MarketingCampaignAuditEvent {
    if (before.isActive !== after.isActive) {
      return after.isActive
        ? MarketingCampaignAuditEvent.ACTIVATED
        : MarketingCampaignAuditEvent.DEACTIVATED;
    }
    return MarketingCampaignAuditEvent.UPDATED;
  }

  private auditSnapshot(campaign: CampaignWithRelations | MarketingCampaign) {
    return {
      shortCode: campaign.shortCode,
      name: campaign.name,
      utmSource: campaign.utmSource,
      utmMedium: campaign.utmMedium,
      utmCampaign: campaign.utmCampaign,
      utmContent: campaign.utmContent,
      utmTerm: campaign.utmTerm,
      targetPath: campaign.targetPath,
      referralLinkId: campaign.referralLinkId,
      isActive: campaign.isActive,
      deactivatedAt: campaign.deactivatedAt?.toISOString() ?? null,
    } as Prisma.InputJsonValue;
  }

  private generateShortCode() {
    const code = randomBytes(9).toString('base64url');
    if (code.length !== SHORT_CODE_LENGTH) {
      throw new InternalServerErrorException('Не удалось сгенерировать короткий код кампании');
    }
    return code;
  }

  private isShortCodeConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('shortCode')
    );
  }

  private serializeCampaign(
    campaign: CampaignWithRelations,
    linkConfig = this.resolveLinkConfig(),
  ) {
    return {
      id: campaign.id,
      shortCode: campaign.shortCode,
      name: campaign.name,
      utmSource: campaign.utmSource,
      utmMedium: campaign.utmMedium,
      utmCampaign: campaign.utmCampaign,
      utmContent: campaign.utmContent,
      utmTerm: campaign.utmTerm,
      targetPath: campaign.targetPath,
      referralLinkId: campaign.referralLinkId,
      referralLink: campaign.referralLink
        ? {
            id: campaign.referralLink.id,
            code: campaign.referralLink.code,
            label: campaign.referralLink.label,
            isActive: campaign.referralLink.isActive,
          }
        : null,
      isActive: campaign.isActive,
      deactivatedAt: campaign.deactivatedAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      links: this.buildLinks(campaign, linkConfig),
    };
  }

  private buildLinks(
    campaign: Pick<
      MarketingCampaign,
      'shortCode' | 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent' | 'utmTerm'
    >,
    linkConfig: CampaignLinkConfig,
  ) {
    const startParam = `ma_${campaign.shortCode}`;

    if (startParam.length > 64) {
      throw new InternalServerErrorException('Параметр Telegram-ссылки превышает лимит 64 символа');
    }

    const webUrl = new URL(`/r/${campaign.shortCode}`, linkConfig.siteUrl);
    webUrl.searchParams.set('utm_source', campaign.utmSource);
    webUrl.searchParams.set('utm_medium', campaign.utmMedium);
    webUrl.searchParams.set('utm_campaign', campaign.utmCampaign);
    if (campaign.utmContent) webUrl.searchParams.set('utm_content', campaign.utmContent);
    if (campaign.utmTerm) webUrl.searchParams.set('utm_term', campaign.utmTerm);

    const telegramUrl = new URL(`https://t.me/${linkConfig.botUsername}`);
    telegramUrl.searchParams.set('start', startParam);

    const miniAppUrl = new URL(`https://t.me/${linkConfig.botUsername}`);
    miniAppUrl.searchParams.set('startapp', startParam);

    return {
      web: webUrl.toString(),
      telegramBot: telegramUrl.toString(),
      telegramMiniApp: miniAppUrl.toString(),
    };
  }

  private resolveLinkConfig(): CampaignLinkConfig {
    return {
      siteUrl: this.requiredUrlConfig('SITE_URL'),
      botUsername: this.requiredBotUsername(),
    };
  }

  private requiredUrlConfig(key: string) {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${key} должен быть задан для генерации campaign links`);
    }

    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('unsupported protocol');
      }
      return url;
    } catch {
      throw new InternalServerErrorException(`${key} содержит некорректный URL`);
    }
  }

  private requiredBotUsername() {
    const username = this.config.get<string>('TELEGRAM_BOT_USERNAME')?.trim();
    if (!username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      throw new InternalServerErrorException(
        'TELEGRAM_BOT_USERNAME должен быть задан для генерации campaign links',
      );
    }
    return username;
  }
}
