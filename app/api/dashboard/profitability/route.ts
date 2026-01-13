import { and, eq, gte, lte } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { jobs } from '@/db/schema/jobs';
import { jobTypes } from '@/db/schema/job_types';
import { getJobProfitability } from '@/lib/financials/jobProfitability';
import { applyJobVisibility } from '@/lib/authz';

type ProfitabilityJobRow = {
  id: string;
  title: string;
  jobTypeId: string | null;
  scheduledStart: Date | null;
};

/**
 * GET /api/dashboard/profitability?orgId=...&startDate=...&endDate=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');
  if (!startDateParam || !endDateParam) return err('VALIDATION_ERROR', 'startDate and endDate are required');

  const startDate = new Date(startDateParam);
  const endDate = new Date(endDateParam);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid startDate or endDate');
  }

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const db = getDb();
  const jobWhere = applyJobVisibility(
    and(
      gte(jobs.scheduledStart, startDate),
      lte(jobs.scheduledStart, endDate),
      eq(jobs.orgId, context.data.orgId)
    ),
    context.data.actor,
    jobs
  );

  const jobRows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      jobTypeId: jobs.jobTypeId,
      scheduledStart: jobs.scheduledStart,
    })
    .from(jobs)
    .where(jobWhere);

  const jobTypeRows = await db
    .select({ id: jobTypes.id, label: jobTypes.label })
    .from(jobTypes)
    .where(eq(jobTypes.orgId, context.data.orgId));

  const jobTypeLabelById = new Map(jobTypeRows.map((row) => [row.id, row.label]));

  const profitabilityRows = await Promise.all(
    jobRows.map(async (job): Promise<{
      job: ProfitabilityJobRow;
      marginPercent: number | null;
      profitCents: number;
      revenueCents: number;
      costCents: number;
    }> => {
      const result = await getJobProfitability({ orgId: context.data.orgId, jobId: job.id });
      if (!result.ok) {
        return {
          job,
          marginPercent: null,
          profitCents: 0,
          revenueCents: 0,
          costCents: 0,
        };
      }
      return {
        job,
        marginPercent: result.data.marginPercent,
        profitCents: result.data.profitCents,
        revenueCents: result.data.revenue.effectiveCents,
        costCents: result.data.costs.totalCents,
      };
    })
  );

  const margins = profitabilityRows.map((row) => row.marginPercent).filter((v): v is number => v !== null);
  const averageMarginPercent =
    margins.length === 0 ? null : Number((margins.reduce((sum, v) => sum + v, 0) / margins.length).toFixed(1));

  const worstJobs = profitabilityRows
    .filter((row) => row.marginPercent !== null)
    .sort((a, b) => Number(a.marginPercent) - Number(b.marginPercent))
    .slice(0, 5)
    .map((row) => ({
      jobId: row.job.id,
      title: row.job.title,
      marginPercent: row.marginPercent,
      profitCents: row.profitCents,
      revenueCents: row.revenueCents,
      costCents: row.costCents,
    }));

  const jobTypeBuckets = new Map<string, { label: string; margins: number[] }>();
  profitabilityRows.forEach((row) => {
    if (row.marginPercent === null) return;
    const typeId = row.job.jobTypeId ?? 'unknown';
    const label = row.job.jobTypeId ? jobTypeLabelById.get(row.job.jobTypeId) ?? 'Unknown' : 'Unassigned';
    const bucket = jobTypeBuckets.get(typeId) ?? { label, margins: [] };
    bucket.margins.push(row.marginPercent);
    jobTypeBuckets.set(typeId, bucket);
  });

  const bestJobTypes = Array.from(jobTypeBuckets.entries())
    .map(([jobTypeId, bucket]) => ({
      jobTypeId,
      label: bucket.label,
      averageMarginPercent:
        bucket.margins.length === 0 ? null : Number((bucket.margins.reduce((s, v) => s + v, 0) / bucket.margins.length).toFixed(1)),
      jobCount: bucket.margins.length,
    }))
    .sort((a, b) => Number(b.averageMarginPercent ?? -Infinity) - Number(a.averageMarginPercent ?? -Infinity))
    .slice(0, 5);

  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
  const bucketSize = totalDays > 60 ? 7 : 1;
  const bucketCount = Math.ceil(totalDays / bucketSize);
  const marginTrend: Array<{ label: string; marginPercent: number | null }> = [];

  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: new Date(startDate.getTime() + index * bucketSize * 24 * 60 * 60 * 1000),
    margins: [] as number[],
  }));

  profitabilityRows.forEach((row) => {
    if (row.marginPercent === null || !row.job.scheduledStart) return;
    const diffDays = Math.floor((row.job.scheduledStart.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor(diffDays / bucketSize)));
    buckets[bucketIndex]?.margins.push(row.marginPercent);
  });

  buckets.forEach((bucket) => {
    const label = bucket.start.toISOString().slice(0, 10);
    const avg =
      bucket.margins.length === 0
        ? null
        : Number((bucket.margins.reduce((s, v) => s + v, 0) / bucket.margins.length).toFixed(1));
    marginTrend.push({ label, marginPercent: avg });
  });

  return ok({
    averageMarginPercent,
    worstJobs,
    bestJobTypes,
    marginTrend,
  });
});
