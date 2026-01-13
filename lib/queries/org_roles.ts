import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orgRoles } from '@/db/schema/org_roles';
import { ok, err, type Result } from '@/lib/result';
import type { OrgRole } from '@/db/schema/org_roles';

export async function listOrgRoles(params: {
  orgId: string;
  includeArchived?: boolean;
}): Promise<Result<OrgRole[]>> {
  try {
    const db = getDb();
    const where = params.includeArchived
      ? eq(orgRoles.orgId, params.orgId)
      : and(eq(orgRoles.orgId, params.orgId), isNull(orgRoles.archivedAt));

    const data = await db
      .select()
      .from(orgRoles)
      .where(where)
      .orderBy(asc(orgRoles.name));

    return ok(data.filter((role) => role.key !== 'warehouse'));
  } catch (error) {
    console.error('Error listing org roles:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch roles', error);
  }
}
