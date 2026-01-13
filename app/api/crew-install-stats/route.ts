import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import type { CrewInstallStats } from '@/db/schema/crew_install_stats';
import { listCrewInstallStats, getCrewInstallStatsByCrewId } from '@/lib/queries/crew_install_stats';
import { recomputeCrewInstallStatsForOrg } from '@/lib/mutations/crew_install_stats';
import { requireOrgContext } from '@/lib/auth/require';

/**
 * GET /api/crew-install-stats?orgId=...&crewMemberId=...&recompute=true
 */
export const GET = withRoute<CrewInstallStats[] | CrewInstallStats | null>(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const crewMemberId = searchParams.get('crewMemberId');
  const shouldRecompute = searchParams.get('recompute') === 'true';
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const resolvedOrgId = context.data.orgId;

  if (shouldRecompute) {
    await recomputeCrewInstallStatsForOrg({ orgId: resolvedOrgId });
  }

  if (crewMemberId) {
    return await getCrewInstallStatsByCrewId({ orgId: resolvedOrgId, crewMemberId });
  }

  return await listCrewInstallStats({ orgId: resolvedOrgId });
});
