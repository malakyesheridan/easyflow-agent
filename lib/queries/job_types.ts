import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobTypes } from '@/db/schema/job_types';
import { ok, err, type Result } from '@/lib/result';
import type { JobType } from '@/db/schema/job_types';

export async function listJobTypes(params: {
  orgId: string;
  includeArchived?: boolean;
}): Promise<Result<JobType[]>> {
  try {
    const db = getDb();
    const where = params.includeArchived
      ? eq(jobTypes.orgId, params.orgId)
      : and(eq(jobTypes.orgId, params.orgId), isNull(jobTypes.archivedAt));

    const data = await db
      .select()
      .from(jobTypes)
      .where(where)
      .orderBy(asc(jobTypes.label));

    return ok(data);
  } catch (error) {
    console.error('Error listing job types:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job types', error);
  }
}
