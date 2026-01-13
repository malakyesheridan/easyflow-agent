import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { tasks } from '@/db/schema/tasks';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { requireOrgContext } from '@/lib/auth/require';
import { getJobsByIds } from '@/lib/queries/jobs';

/**
 * GET /api/tasks/summary
 * Query:
 * - orgId (required)
 * - jobId (repeatable; at least one required)
 *
 * Returns one record per requested jobId:
 * - total
 * - completedTotal
 * - percent (null if total === 0)
 * - requiredTotal
 * - requiredCompleted
 * - requiredPercent (null if requiredTotal === 0)
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobIds = searchParams.getAll('jobId').filter(Boolean);

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (jobIds.length === 0) return err('VALIDATION_ERROR', 'At least one jobId query parameter is required');

  const uniqueJobIds = Array.from(new Set(jobIds)).slice(0, 200);
  const visibleJobs = await getJobsByIds(uniqueJobIds, context.data.orgId, context.data.actor);
  if (!visibleJobs.ok) return visibleJobs;
  const visibleJobIds = visibleJobs.data.map((job) => job.id);
  if (visibleJobIds.length === 0) return ok([]);

  const db = getDb();
  const rows = await db
    .select({
      jobId: tasks.jobId,
      total: sql<number>`count(*)`.mapWith(Number),
      completedTotal: sql<number>`sum(case when ${tasks.status} = 'completed' then 1 else 0 end)`.mapWith(Number),
      requiredTotal: sql<number>`sum(case when ${tasks.isRequired} then 1 else 0 end)`.mapWith(Number),
      requiredCompleted: sql<number>`sum(case when ${tasks.isRequired} and ${tasks.status} = 'completed' then 1 else 0 end)`.mapWith(Number),
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, context.data.orgId), inArray(tasks.jobId, visibleJobIds)))
    .groupBy(tasks.jobId);

  const byJobId = new Map<
    string,
    { total: number; completedTotal: number; requiredTotal: number; requiredCompleted: number }
  >();
  rows.forEach((r) => {
    byJobId.set(String(r.jobId), {
      total: Number(r.total ?? 0),
      completedTotal: Number(r.completedTotal ?? 0),
      requiredTotal: Number(r.requiredTotal ?? 0),
      requiredCompleted: Number(r.requiredCompleted ?? 0),
    });
  });

  return ok(
    visibleJobIds.map((jobId) => {
      const summary = byJobId.get(jobId) ?? {
        total: 0,
        completedTotal: 0,
        requiredTotal: 0,
        requiredCompleted: 0,
      };
      const percent = summary.total > 0 ? (summary.completedTotal / summary.total) * 100 : null;
      const requiredPercent =
        summary.requiredTotal > 0 ? (summary.requiredCompleted / summary.requiredTotal) * 100 : null;
      return { jobId, ...summary, percent, requiredPercent };
    })
  );
});
