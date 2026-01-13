import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orgs, type Org } from '@/db/schema/orgs';
import { ok, err, type Result } from '@/lib/result';

export async function getOrgById(params: { orgId: string }): Promise<Result<Org>> {
  try {
    const db = getDb();
    const [row] = await db.select().from(orgs).where(eq(orgs.id, params.orgId)).limit(1);
    if (!row) return err('NOT_FOUND', 'Organisation not found');
    return ok(row);
  } catch (error) {
    console.error('Error fetching org:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch organisation', error);
  }
}
