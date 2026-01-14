import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { leadSources, type LeadSource } from '@/db/schema/lead_sources';
import { ok, err, type Result } from '@/lib/result';

export async function listLeadSources(params: { orgId: string }): Promise<Result<LeadSource[]>> {
  try {
    const db = getDb();
    const data = await db
      .select()
      .from(leadSources)
      .where(eq(leadSources.orgId, params.orgId))
      .orderBy(asc(leadSources.sortOrder), asc(leadSources.name));
    return ok(data);
  } catch (error) {
    console.error('Error listing lead sources:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch lead sources', error);
  }
}
