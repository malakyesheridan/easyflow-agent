import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { listInstallModifiersForJob } from '@/lib/queries/install_modifiers';
import { getJobM2Totals } from '@/lib/queries/install_time';
import { getCrewInstallStatsByCrewId } from '@/lib/queries/crew_install_stats';
import { recomputeCrewInstallStatsForOrg } from '@/lib/mutations/crew_install_stats';
import { seedDefaultInstallModifiers } from '@/lib/mutations/install_modifiers';
import { computeInstallEstimate, selectCrewSpeed } from '@/lib/utils/installTime';
import { requireOrgContext } from '@/lib/auth/require';

const MAX_STATS_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * GET /api/install-time-estimate?orgId=...&jobId=...&crewMemberId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  const crewMemberId = searchParams.get('crewMemberId');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!jobId || !crewMemberId) {
    return err('VALIDATION_ERROR', 'jobId and crewMemberId are required');
  }
  const resolvedOrgId = context.data.orgId;

  let [modifierResult, m2Result] = await Promise.all([
    listInstallModifiersForJob({ orgId: resolvedOrgId, jobId }),
    getJobM2Totals({ orgId: resolvedOrgId, jobId }),
  ]);

  if (modifierResult.ok && modifierResult.data.length === 0) {
    await seedDefaultInstallModifiers(resolvedOrgId);
    modifierResult = await listInstallModifiersForJob({ orgId: resolvedOrgId, jobId });
  }

  if (!modifierResult.ok) return modifierResult;
  if (!m2Result.ok) return m2Result;

  let statsResult = await getCrewInstallStatsByCrewId({ orgId: resolvedOrgId, crewMemberId });
  if (statsResult.ok) {
    const stats = statsResult.data;
    const computedAt = stats?.computedAt ? new Date(stats.computedAt) : null;
    const stale = !computedAt || Number.isNaN(computedAt.getTime()) || Date.now() - computedAt.getTime() > MAX_STATS_AGE_MS;
    if (stale) {
      await recomputeCrewInstallStatsForOrg({ orgId: resolvedOrgId });
      statsResult = await getCrewInstallStatsByCrewId({ orgId: resolvedOrgId, crewMemberId });
    }
  }

  if (!statsResult.ok) return statsResult;

  const totals = m2Result.data;
  const jobTotalM2 = totals.plannedM2 > 0 ? totals.plannedM2 : totals.usedM2 > 0 ? totals.usedM2 : 0;
  const jobM2Source = totals.plannedM2 > 0 ? 'planned' : totals.usedM2 > 0 ? 'used' : 'none';

  const crewSpeed = selectCrewSpeed(statsResult.data ?? null);
  const estimate = computeInstallEstimate({
    jobTotalM2,
    jobM2Source,
    crewSpeed,
    modifiers: modifierResult.data,
  });

  return ok({
    jobId,
    crewMemberId,
    ...estimate,
  });
});
