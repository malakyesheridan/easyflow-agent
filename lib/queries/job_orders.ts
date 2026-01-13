import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobOrders, type JobOrder } from '@/db/schema/job_orders';
import { ok, err, type Result } from '@/lib/result';
import { jobOrdersListSchema } from '@/lib/validators/job_orders';

export async function listJobOrders(params: { orgId: string; jobId: string }): Promise<Result<JobOrder[]>> {
  try {
    const validated = jobOrdersListSchema.parse(params);
    const db = getDb();
    const rows = await db
      .select()
      .from(jobOrders)
      .where(and(eq(jobOrders.orgId, validated.orgId), eq(jobOrders.jobId, validated.jobId)))
      .orderBy(desc(jobOrders.createdAt));
    return ok(rows);
  } catch (error) {
    console.error('Error listing job orders:', error);
    return err('INTERNAL_ERROR', 'Failed to list job orders', error);
  }
}

export async function getJobOrderById(params: { orgId: string; id: string }): Promise<Result<JobOrder>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(jobOrders)
      .where(and(eq(jobOrders.orgId, params.orgId), eq(jobOrders.id, params.id)))
      .limit(1);
    if (!row) return err('NOT_FOUND', 'Job order not found');
    return ok(row);
  } catch (error) {
    console.error('Error fetching job order:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job order', error);
  }
}
