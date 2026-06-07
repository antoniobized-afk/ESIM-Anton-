import { AuthIdentityProvider, UserIdentityAuditEvent } from '@prisma/client';
import { UserIdentityBackfillApplier } from './user-identity-backfill-applier.service';
import { UserIdentityBackfillService } from './user-identity-backfill.service';
import { UserIdentityCandidateBuilder } from './user-identity-candidate-builder.service';
import { UserIdentityPreflightService } from './user-identity-preflight.service';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    telegramId: null,
    username: null,
    firstName: null,
    lastName: null,
    email: null,
    authProvider: null,
    providerId: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userIdentity: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'identity_1' }),
    },
    userIdentityAudit: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
    },
    $transaction: jest.fn().mockImplementation(async (callback: any) => callback(prisma)),
  };
  const candidateBuilder = new UserIdentityCandidateBuilder();
  const preflightService = new UserIdentityPreflightService(
    prisma as any,
    candidateBuilder,
  );
  const applier = new UserIdentityBackfillApplier(prisma as any);

  return {
    prisma,
    service: new UserIdentityBackfillService(preflightService, applier),
  };
}

describe('UserIdentityBackfillService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('блокирует backfill при дублях normalized email', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: 'user_1', email: 'Alice@Example.com' }),
      makeUser({ id: 'user_2', email: ' alice@example.com ' }),
    ]);

    const report = await service.preflight();

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DUPLICATE_NORMALIZED_EMAIL',
          severity: 'error',
          userIds: ['user_1', 'user_2'],
        }),
      ]),
    );
  });

  it('планирует bot-only Telegram identity как неблокирующий info-сценарий', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: 'telegram_user', telegramId: 123456789n, username: 'mojo_user' }),
    ]);

    const report = await service.preflight();

    expect(report.ok).toBe(true);
    expect(report.issueCounts).toEqual({ error: 0, warning: 0, info: 1 });
    expect(report.plannedIdentities).toBe(1);
    expect(report.plannedByProvider[AuthIdentityProvider.TELEGRAM]).toBe(1);
    expect(report.issues[0]).toEqual(
      expect.objectContaining({
        code: 'BOT_ONLY_TELEGRAM_USER',
        severity: 'info',
        userId: 'telegram_user',
      }),
    );
  });

  it('блокирует Telegram legacy mismatch между providerId и telegramId', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeUser({
        id: 'user_telegram',
        telegramId: 111n,
        authProvider: 'telegram',
        providerId: '222',
      }),
    ]);

    const report = await service.preflight();

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TELEGRAM_PROVIDER_SUBJECT_MISMATCH',
          severity: 'error',
          userId: 'user_telegram',
          providerSubjectPreview: '2***2',
          details: {
            telegramIdHash: expect.any(String),
            telegramIdPreview: '1***1',
          },
        }),
      ]),
    );
  });

  it('блокирует несколько provider subjects одного provider для одного user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeUser({
        id: 'email_user',
        email: 'profile@example.com',
        authProvider: 'email',
        providerId: 'legacy@example.com',
      }),
    ]);

    const report = await service.preflight();

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DUPLICATE_PROVIDER_FOR_USER',
          severity: 'error',
          userId: 'email_user',
          provider: AuthIdentityProvider.EMAIL,
        }),
      ]),
    );
  });

  it('dry-run не пишет identities и audit', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: 'email_user', email: 'test@example.com' }),
    ]);

    const result = await service.backfill();

    expect(result).toMatchObject({
      dryRun: true,
      applied: false,
      reason: 'dry_run',
      created: 0,
      skipped: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).not.toHaveBeenCalled();
  });

  it('apply создает identity и audit без сырого providerSubject в audit snapshot', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeUser({
        id: 'email_user',
        email: 'Test@Example.com',
        authProvider: 'email',
        providerId: 'test@example.com',
      }),
    ]);

    const result = await service.backfill({ dryRun: false });

    expect(result).toMatchObject({
      dryRun: false,
      applied: true,
      reason: 'applied',
      created: 1,
      skipped: 0,
    });
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'email_user',
        provider: AuthIdentityProvider.EMAIL,
        providerSubject: 'test@example.com',
        emailVerified: true,
      }),
      select: { id: true },
    });
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.BACKFILLED,
        userId: 'email_user',
        provider: AuthIdentityProvider.EMAIL,
        providerSubjectHash: expect.any(String),
        providerSubjectPreview: 'te***@example.com',
        after: expect.not.objectContaining({
          providerSubject: 'test@example.com',
          email: 'test@example.com',
        }),
        metadata: expect.not.objectContaining({
          email: 'test@example.com',
        }),
      }),
    });
    const auditPayload = prisma.userIdentityAudit.create.mock.calls[0][0].data;
    expect(auditPayload.after).toEqual(
      expect.objectContaining({
        emailHash: expect.any(String),
        emailPreview: 'te***@example.com',
      }),
    );
  });

  it('apply идемпотентно пропускает identity, если она уже принадлежит тому же user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: 'google_user', authProvider: 'google', providerId: 'google_1' }),
    ]);
    prisma.userIdentity.findMany.mockResolvedValue([
      {
        id: 'identity_existing',
        userId: 'google_user',
        provider: AuthIdentityProvider.GOOGLE,
        providerSubject: 'google_1',
      },
    ]);
    prisma.userIdentity.findUnique.mockResolvedValue({
      id: 'identity_existing',
      userId: 'google_user',
    });

    const result = await service.backfill({ dryRun: false });

    expect(result).toMatchObject({
      applied: true,
      created: 0,
      skipped: 1,
    });
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).not.toHaveBeenCalled();
  });

  it('блокирует apply, если existing identity принадлежит другому user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: 'google_user', authProvider: 'google', providerId: 'google_1' }),
    ]);
    prisma.userIdentity.findMany.mockResolvedValue([
      {
        id: 'identity_existing',
        userId: 'other_user',
        provider: AuthIdentityProvider.GOOGLE,
        providerSubject: 'google_1',
      },
    ]);

    const result = await service.backfill({ dryRun: false });

    expect(result).toMatchObject({
      dryRun: false,
      applied: false,
      reason: 'preflight_failed',
      created: 0,
      skipped: 0,
    });
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EXISTING_IDENTITY_CONFLICT',
          severity: 'error',
        }),
      ]),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
