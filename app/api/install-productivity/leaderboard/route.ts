import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canViewJobs } from '@/lib/authz';
import { getJobsByIds } from '@/lib/queries/jobs';
import { listJobTimeEntriesForRange } from '@/lib/queries/job_time_entries';
import { listCrewMembersByIds } from '@/lib/queries/crew_members';
import {
  buildMetricInsights,
  getMetricDefinition,
  resolveMetricKey,
  type MetricKey,
} from '@/lib/metrics/installProductivityInsights';

type LeaderboardRow = {
  id: string;
  name: string;
  value: number;
};

type WindowResponse = {
  average: number;
  jobs: LeaderboardRow[];
  employees?: LeaderboardRow[];
};

type InstallProductivityLeaderboardResponse = {
  metric: {
    key: MetricKey;
    label: string;
    abbreviation: string;
    unit: 'rate' | 'percent';
  };
  windows: {
    days7: WindowResponse;
    days30: WindowResponse;
    days90: WindowResponse;
  };
};

/**
 * GET /api/install-productivity/leaderboard?orgId=...&metric=nir
 */
export const GET = withRoute<InstallProductivityLeaderboardResponse>(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const metricParam = searchParams.get('metric');

  const metricKey = resolveMetricKey(metricParam);
  if (!metricKey) return err('VALIDATION_ERROR', 'metric query parameter is invalid');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const now = new Date();
  const start90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const entriesResult = await listJobTimeEntriesForRange({
    orgId: context.data.orgId,
    start: start90,
    end: now,
  });
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
  const jobsResult = await getJobsByIds(jobIds, context.data.orgId, context.data.actor);
  if (!jobsResult.ok) return jobsResult;

  const insights = buildMetricInsights({
    entries,
    jobs: jobsResult.data,
    metric: metricKey,
  });

  const jobTitleById = new Map(jobsResult.data.map((row) => [row.id, row.title || 'Job']));

  const allCrewIds = new Set<string>();
  (Object.values(insights) as Array<{ employeeLeaderboard?: { id: string }[] }>).forEach((window) => {
    window.employeeLeaderboard?.forEach((row) => allCrewIds.add(row.id));
  });

  const crewNames = new Map<string, string>();
  if (allCrewIds.size > 0) {
    const crewResult = await listCrewMembersByIds({ orgId: context.data.orgId, ids: Array.from(allCrewIds) });
    if (crewResult.ok) {
      for (const crew of crewResult.data) {
        crewNames.set(crew.id, crew.displayName);
      }
    }
  }

  const toWindowResponse = (window: typeof insights.days7): WindowResponse => ({
    average: window.average,
    jobs: window.jobLeaderboard.map((row) => ({
      id: row.id,
      name: jobTitleById.get(row.id) ?? 'Job',
      value: row.value,
    })),
    employees: window.employeeLeaderboard?.map((row) => ({
      id: row.id,
      name: crewNames.get(row.id) ?? 'Crew member',
      value: row.value,
    })),
  });

  const metricDef = getMetricDefinition(metricKey);

  return ok<InstallProductivityLeaderboardResponse>({
    metric: {
      key: metricDef.key,
      label: metricDef.label,
      abbreviation: metricDef.abbreviation,
      unit: metricDef.unit,
    },
    windows: {
      days7: toWindowResponse(insights.days7),
      days30: toWindowResponse(insights.days30),
      days90: toWindowResponse(insights.days90),
    },
  });
});
