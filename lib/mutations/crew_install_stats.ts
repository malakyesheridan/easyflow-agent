import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { crewMembers } from '@/db/schema/crew_members';
import { crewInstallStats, type CrewInstallStats, type NewCrewInstallStats } from '@/db/schema/crew_install_stats';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import { computeEmployeePeriodMetrics, type TimeEntry } from '@/lib/metrics/installProductivity';
import { listJobTimeEntriesForRange } from '@/lib/queries/job_time_entries';
import { toNumericString } from '@/lib/utils/quantity';

type CrewWindowTotals = {
  attributedM2: number;
  installMinutes: number;
};

function emptyWindowTotals(): CrewWindowTotals {
  return { attributedM2: 0, installMinutes: 0 };
}

function buildWindowMap(rows: Array<{ crewMemberId: string; installMinutes: number; attributedM2: number }>) {
  const map = new Map<string, CrewWindowTotals>();
  for (const row of rows) {
    map.set(row.crewMemberId, {
      attributedM2: row.attributedM2,
      installMinutes: row.installMinutes,
    });
  }
  return map;
}

export async function recomputeCrewInstallStatsForOrg(params: { orgId: string }): Promise<Result<CrewInstallStats[]>> {
  try {
    const db = getDb();
    const now = new Date();
    const start90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const crewRows = await db
      .select({ id: crewMembers.id })
      .from(crewMembers)
      .where(eq(crewMembers.orgId, params.orgId));

    const crewIds = crewRows.map((c) => c.id);
    if (crewIds.length === 0) return ok([]);

    const entriesResult = await listJobTimeEntriesForRange({
      orgId: params.orgId,
      start: start90,
      end: now,
    });
    if (!entriesResult.ok) return entriesResult;

    const entries: TimeEntry[] = entriesResult.data.map((row) => ({
      jobId: String(row.jobId),
      crewMemberId: row.crewMemberId ? String(row.crewMemberId) : null,
      minutes: row.minutes,
      startTime: row.startTime,
      endTime: row.endTime,
      createdAt: row.createdAt,
      bucket: row.bucket ?? null,
      delayReason: row.delayReason ?? null,
    }));

    const jobIds = Array.from(new Set(entries.map((entry) => entry.jobId)));
    const jobRows =
      jobIds.length === 0
        ? []
        : await db
            .select({ id: jobs.id, acceptedM2: jobs.acceptedM2, reworkM2: jobs.reworkM2 })
            .from(jobs)
            .where(and(eq(jobs.orgId, params.orgId), inArray(jobs.id, jobIds)));

    const jobsForMetrics = jobRows.map((job) => ({
      id: job.id,
      acceptedM2: job.acceptedM2,
      reworkM2: job.reworkM2,
    }));

    const metrics7 = computeEmployeePeriodMetrics({
      jobs: jobsForMetrics,
      entries,
      dateRange: { start: start7, end: now },
    });
    const metrics30 = computeEmployeePeriodMetrics({
      jobs: jobsForMetrics,
      entries,
      dateRange: { start: start30, end: now },
    });
    const metrics90 = computeEmployeePeriodMetrics({
      jobs: jobsForMetrics,
      entries,
      dateRange: { start: start90, end: now },
    });

    const map7 = buildWindowMap(metrics7);
    const map30 = buildWindowMap(metrics30);
    const map90 = buildWindowMap(metrics90);

    const computedAt = new Date();
    const rows: NewCrewInstallStats[] = crewIds.map((crewId) => {
      const totals7 = map7.get(crewId) ?? emptyWindowTotals();
      const totals30 = map30.get(crewId) ?? emptyWindowTotals();
      const totals90 = map90.get(crewId) ?? emptyWindowTotals();

      const m2PerMinute7d = totals7.installMinutes > 0 ? totals7.attributedM2 / totals7.installMinutes : 0;
      const m2PerMinute30d = totals30.installMinutes > 0 ? totals30.attributedM2 / totals30.installMinutes : 0;
      const m2PerMinute90d = totals90.installMinutes > 0 ? totals90.attributedM2 / totals90.installMinutes : 0;

      return {
        orgId: params.orgId,
        crewMemberId: crewId,
        m2Total7d: toNumericString(totals7.attributedM2) as any,
        minutesTotal7d: Math.round(totals7.installMinutes),
        m2PerMinute7d: toNumericString(m2PerMinute7d) as any,
        m2Total30d: toNumericString(totals30.attributedM2) as any,
        minutesTotal30d: Math.round(totals30.installMinutes),
        m2PerMinute30d: toNumericString(m2PerMinute30d) as any,
        m2Total90d: toNumericString(totals90.attributedM2) as any,
        minutesTotal90d: Math.round(totals90.installMinutes),
        m2PerMinute90d: toNumericString(m2PerMinute90d) as any,
        computedAt,
        updatedAt: computedAt,
        createdAt: computedAt,
      } as any;
    });

    const finalRows = await db.transaction(async (tx) => {
      await tx.delete(crewInstallStats).where(eq(crewInstallStats.orgId, params.orgId));
      if (rows.length === 0) return [] as CrewInstallStats[];
      return await tx.insert(crewInstallStats).values(rows as any).returning();
    });

    return ok(finalRows);
  } catch (error) {
    console.error('Error recomputing crew install stats:', error);
    return err('INTERNAL_ERROR', 'Failed to compute crew install stats', error);
  }
}
