import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { crewInstallStats } from '@/db/schema/crew_install_stats';
import { ok, err, type Result } from '@/lib/result';
import type { CrewInstallStats } from '@/db/schema/crew_install_stats';

export async function listCrewInstallStats(params: { orgId: string }): Promise<Result<CrewInstallStats[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(crewInstallStats)
      .where(eq(crewInstallStats.orgId, params.orgId))
      .orderBy(asc(crewInstallStats.crewMemberId));
    return ok(rows);
  } catch (error) {
    console.error('Error listing crew install stats:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch crew install stats', error);
  }
}

export async function getCrewInstallStatsByCrewId(params: {
  orgId: string;
  crewMemberId: string;
}): Promise<Result<CrewInstallStats | null>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(crewInstallStats)
      .where(and(eq(crewInstallStats.orgId, params.orgId), eq(crewInstallStats.crewMemberId, params.crewMemberId)))
      .limit(1);
    return ok(row ?? null);
  } catch (error) {
    console.error('Error fetching crew install stats:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch crew install stats', error);
  }
}
