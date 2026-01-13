import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canViewJobs } from '@/lib/authz';
import { getJobById, getJobsByIds } from '@/lib/queries/jobs';
import { listJobTimeEntries, listJobTimeEntriesForRange } from '@/lib/queries/job_time_entries';
import { computeJobMetrics, computeEmployeePeriodMetrics, computeQualityScore } from '@/lib/metrics/installProductivity';
import { getJobM2Totals } from '@/lib/queries/install_time';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { toNumber } from '@/lib/utils/quantity';

/**
 * GET /api/install-productivity?orgId=...&jobId=...
 * GET /api/install-productivity?orgId=...&start=...&end=...&crewMemberId=...
 */
type InstallProductivityJobResponse = {
  jobId: string;
  output: {
    plannedM2: string | number | null;
    variationM2: string | number | null;
    claimedM2: string | number | null;
    acceptedM2: string | number | null;
    reworkM2: string | number | null;
    acceptedM2ApprovedBy: string | null;
    acceptedM2ApprovedAt: Date | null;
  };
  complexity: {
    accessDifficulty: number | null;
    heightLiftRequirement: number | null;
    panelHandlingSize: number | null;
    siteConstraints: number | null;
    detailingComplexity: number | null;
  };
  quality: {
    defectCount: number;
    callbackFlag: boolean;
    missingDocsFlag: boolean;
    safetyFlag: boolean;
  };
  metrics: ReturnType<typeof computeJobMetrics>;
  legacy: { m2PerMinute: number; totalM2: number; totalMinutes: number; source: string } | null;
};

type InstallProductivityRangeResponse = {
  dateRange: { start: string; end: string };
  crewMemberId: string | null;
  employeeMetrics: ReturnType<typeof computeEmployeePeriodMetrics>;
  qualityTrends: {
    byJobType: Array<{ jobTypeId: string; averageScore: number; jobCount: number }>;
    byCrewMember: Array<{ crewMemberId: string; averageScore: number; minutes: number }>;
  };
};

type InstallProductivityResponse = InstallProductivityJobResponse | InstallProductivityRangeResponse;

export const GET = withRoute<InstallProductivityResponse>(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  const crewMemberId = searchParams.get('crewMemberId');
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const resolvedOrgId = context.data.orgId;

  if (jobId) {
    const jobResult = await getJobById(jobId, resolvedOrgId, context.data.actor);
    if (!jobResult.ok) return jobResult;

    const entriesResult = await listJobTimeEntries({ orgId: resolvedOrgId, jobId });
    if (!entriesResult.ok) return entriesResult;

    const settingsResult = await getOrgSettings({ orgId: resolvedOrgId });
    const varianceThresholdPercent = settingsResult.ok
      ? Number(settingsResult.data?.varianceThresholdPercent ?? 10)
      : 10;

    const entries = entriesResult.data.map((row) => ({
      jobId: String(row.jobId),
      crewMemberId: row.crewMemberId ? String(row.crewMemberId) : null,
      minutes: row.minutes,
      startTime: row.startTime,
      endTime: row.endTime,
      createdAt: row.createdAt,
      bucket: row.bucket ?? null,
      delayReason: row.delayReason ?? null,
    }));

    const metrics = computeJobMetrics(jobResult.data, entries, {
      thresholds: { claimedVarianceThresholdPercent: varianceThresholdPercent },
    });

    let legacy: { m2PerMinute: number; totalM2: number; totalMinutes: number; source: string } | null = null;
    if (metrics.installPersonMinutes === 0 && metrics.onsitePersonMinutes === 0 && entries.length > 0) {
      const totalMinutes = entries.reduce((sum, entry) => sum + toNumber(entry.minutes), 0);
      const totalsResult = await getJobM2Totals({ orgId: resolvedOrgId, jobId });
      if (totalsResult.ok) {
        const totalM2 = totalsResult.data.plannedM2 > 0 ? totalsResult.data.plannedM2 : totalsResult.data.usedM2;
        legacy = totalMinutes > 0 && totalM2 > 0
          ? { m2PerMinute: totalM2 / totalMinutes, totalM2, totalMinutes, source: totalsResult.data.plannedM2 > 0 ? 'planned' : 'used' }
          : null;
      }
    }

    return ok<InstallProductivityResponse>({
      jobId: jobResult.data.id,
      output: {
        plannedM2: jobResult.data.plannedM2,
        variationM2: jobResult.data.variationM2,
        claimedM2: jobResult.data.claimedM2,
        acceptedM2: jobResult.data.acceptedM2,
        reworkM2: jobResult.data.reworkM2,
        acceptedM2ApprovedBy: jobResult.data.acceptedM2ApprovedBy,
        acceptedM2ApprovedAt: jobResult.data.acceptedM2ApprovedAt,
      },
      complexity: {
        accessDifficulty: jobResult.data.complexityAccessDifficulty,
        heightLiftRequirement: jobResult.data.complexityHeightLiftRequirement,
        panelHandlingSize: jobResult.data.complexityPanelHandlingSize,
        siteConstraints: jobResult.data.complexitySiteConstraints,
        detailingComplexity: jobResult.data.complexityDetailingComplexity,
      },
      quality: {
        defectCount: jobResult.data.qualityDefectCount,
        callbackFlag: jobResult.data.qualityCallbackFlag,
        missingDocsFlag: jobResult.data.qualityMissingDocsFlag,
        safetyFlag: jobResult.data.qualitySafetyFlag,
      },
      metrics,
      legacy,
    });
  }

  if (!startParam || !endParam) {
    return err('VALIDATION_ERROR', 'Provide jobId or start/end date range');
  }

  const start = new Date(startParam);
  const end = new Date(endParam);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid date range');
  }

  const entriesResult = await listJobTimeEntriesForRange({ orgId: resolvedOrgId, start, end });
  if (!entriesResult.ok) return entriesResult;
  const entries = entriesResult.data.map((row) => ({
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
  const jobsResult = await getJobsByIds(jobIds, resolvedOrgId, context.data.actor);
  if (!jobsResult.ok) return jobsResult;

  const employeeMetrics = computeEmployeePeriodMetrics({
    jobs: jobsResult.data.map((job) => ({ id: job.id, acceptedM2: job.acceptedM2, reworkM2: job.reworkM2 })),
    entries,
    dateRange: { start, end },
  }).filter((row) => (crewMemberId ? row.crewMemberId === crewMemberId : true));

  const qualityByJobType = new Map<string, { total: number; count: number }>();
  const qualityByCrew = new Map<string, { weightedTotal: number; minutes: number }>();
  const installMinutesByJob = new Map<string, Map<string, number>>();

  for (const entry of entries) {
    if (entry.bucket !== 'INSTALL' || !entry.crewMemberId) continue;
    const minutes = toNumber(entry.minutes);
    if (minutes <= 0) continue;
    const crewMap = installMinutesByJob.get(entry.jobId) ?? new Map<string, number>();
    crewMap.set(entry.crewMemberId, (crewMap.get(entry.crewMemberId) ?? 0) + minutes);
    installMinutesByJob.set(entry.jobId, crewMap);
  }

  for (const job of jobsResult.data) {
    const qualityScore = computeQualityScore(job);
    const jobTypeId = job.jobTypeId ?? 'unknown';
    const typeTotals = qualityByJobType.get(jobTypeId) ?? { total: 0, count: 0 };
    qualityByJobType.set(jobTypeId, { total: typeTotals.total + qualityScore, count: typeTotals.count + 1 });

    const crewMap = installMinutesByJob.get(job.id);
    if (!crewMap) continue;
    for (const [crewId, minutes] of crewMap.entries()) {
      const crewTotals = qualityByCrew.get(crewId) ?? { weightedTotal: 0, minutes: 0 };
      qualityByCrew.set(crewId, {
        weightedTotal: crewTotals.weightedTotal + qualityScore * minutes,
        minutes: crewTotals.minutes + minutes,
      });
    }
  }

    return ok<InstallProductivityResponse>({
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      crewMemberId: crewMemberId ?? null,
      employeeMetrics,
    qualityTrends: {
      byJobType: Array.from(qualityByJobType.entries()).map(([jobTypeId, totals]) => ({
        jobTypeId,
        averageScore: totals.count > 0 ? totals.total / totals.count : 0,
        jobCount: totals.count,
      })),
      byCrewMember: Array.from(qualityByCrew.entries()).map(([crewId, totals]) => ({
        crewMemberId: crewId,
        averageScore: totals.minutes > 0 ? totals.weightedTotal / totals.minutes : 0,
        minutes: totals.minutes,
      })),
    },
  });
});
