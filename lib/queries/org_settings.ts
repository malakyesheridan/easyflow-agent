import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orgSettings, type OrgSettings } from '@/db/schema/org_settings';
import { ok, err, type Result } from '@/lib/result';

export async function getOrgSettings(params: { orgId: string }): Promise<Result<OrgSettings | null>> {
  try {
    const db = getDb();
    const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, params.orgId)).limit(1);
    return ok(row ?? null);
  } catch (error) {
    console.error('Error getting org settings:', error);
    return err('INTERNAL_ERROR', 'Failed to load settings', error);
  }
}

