import { Injectable } from '@nestjs/common';
import { UserIdentityBackfillApplier } from './user-identity-backfill-applier.service';
import {
  UserIdentityBackfillResult,
  UserIdentityPreflightReport,
} from './user-identity-backfill.types';
import { UserIdentityPreflightService } from './user-identity-preflight.service';

@Injectable()
export class UserIdentityBackfillService {
  constructor(
    private readonly preflightService: UserIdentityPreflightService,
    private readonly applier: UserIdentityBackfillApplier,
  ) {}

  async preflight(): Promise<UserIdentityPreflightReport> {
    return this.preflightService.toPublicReport(await this.preflightService.build());
  }

  async backfill(options: { dryRun?: boolean } = {}): Promise<UserIdentityBackfillResult> {
    const dryRun = options.dryRun ?? true;
    const internal = await this.preflightService.build();
    const report = this.preflightService.toPublicReport(internal);

    if (!report.ok) {
      return this.preflightFailedResult(dryRun, report);
    }

    if (dryRun) {
      return this.dryRunResult(report);
    }

    const applied = await this.applier.apply(internal.candidates);

    return {
      dryRun: false,
      applied: true,
      reason: 'applied',
      created: applied.created,
      skipped: applied.skipped,
      report,
    };
  }

  private preflightFailedResult(
    dryRun: boolean,
    report: UserIdentityPreflightReport,
  ): UserIdentityBackfillResult {
    return {
      dryRun,
      applied: false,
      reason: 'preflight_failed',
      created: 0,
      skipped: 0,
      report,
    };
  }

  private dryRunResult(report: UserIdentityPreflightReport): UserIdentityBackfillResult {
    return {
      dryRun: true,
      applied: false,
      reason: 'dry_run',
      created: 0,
      skipped: 0,
      report,
    };
  }
}
