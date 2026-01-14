import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { matchingConfig, type MatchingConfig } from '@/db/schema/matching_config';
import { ok, err, type Result } from '@/lib/result';

export async function getMatchingConfig(params: { orgId: string }): Promise<Result<MatchingConfig | null>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(matchingConfig)
      .where(eq(matchingConfig.orgId, params.orgId))
      .limit(1);
    return ok(row ?? null);
  } catch (error) {
    console.error('Error getting matching config:', error);
    return err('INTERNAL_ERROR', 'Failed to load matching config', error);
  }
}
