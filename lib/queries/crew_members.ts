import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { crewMembers } from '@/db/schema/crew_members';
import { ok, err, type Result } from '@/lib/result';
import type { CrewMember } from '@/db/schema/crew_members';

export async function listCrewMembers(params: {
  orgId: string;
  activeOnly?: boolean;
}): Promise<Result<CrewMember[]>> {
  try {
    const db = getDb();
    const where = params.activeOnly
      ? and(eq(crewMembers.orgId, params.orgId), eq(crewMembers.active, true))
      : eq(crewMembers.orgId, params.orgId);

    const data = await db
      .select()
      .from(crewMembers)
      .where(where)
      .orderBy(asc(crewMembers.displayName));

    return ok(data);
  } catch (error) {
    console.error('Error listing crew members:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch crew members', error);
  }
}

export async function listCrewMembersByIds(params: {
  orgId: string;
  ids: string[];
}): Promise<Result<CrewMember[]>> {
  try {
    if (!params.ids.length) return ok([]);
    const db = getDb();
    const rows = await db
      .select()
      .from(crewMembers)
      .where(and(eq(crewMembers.orgId, params.orgId), inArray(crewMembers.id, params.ids)))
      .orderBy(asc(crewMembers.displayName));
    return ok(rows);
  } catch (error) {
    console.error('Error listing crew members by ids:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch crew members', error);
  }
}

export async function getCrewMemberById(params: {
  orgId: string;
  id: string;
}): Promise<Result<CrewMember>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(crewMembers)
      .where(and(eq(crewMembers.orgId, params.orgId), eq(crewMembers.id, params.id)))
      .limit(1);

    if (!row) return err('NOT_FOUND', 'Crew member not found');
    return ok(row);
  } catch (error) {
    console.error('Error fetching crew member:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch crew member', error);
  }
}
