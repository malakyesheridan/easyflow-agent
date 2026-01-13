import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobCosts, type JobCost } from '@/db/schema/job_costs';
import { ok, err, type Result } from '@/lib/result';

export async function listJobCosts(params: { orgId: string; jobId: string }): Promise<Result<JobCost[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(jobCosts)
      .where(and(eq(jobCosts.orgId, params.orgId), eq(jobCosts.jobId, params.jobId)))
      .orderBy(desc(jobCosts.createdAt));
    return ok(rows);
  } catch (error) {
    console.error('Error listing job costs:', error);
    return err('INTERNAL_ERROR', 'Failed to list job costs', error);
  }
}

export async function getJobCostById(params: { orgId: string; id: string }): Promise<Result<JobCost | null>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(jobCosts)
      .where(and(eq(jobCosts.orgId, params.orgId), eq(jobCosts.id, params.id)))
      .limit(1);
    return ok(row ?? null);
  } catch (error) {
    console.error('Error fetching job cost:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job cost', error);
  }
}
