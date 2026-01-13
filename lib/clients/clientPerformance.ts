import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobs } from '@/db/schema/jobs';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobPayments } from '@/db/schema/job_payments';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';
import { getJobProfitability } from '@/lib/financials/jobProfitability';
import { isSuccessfulPaymentStatus } from '@/lib/financials/invoiceState';
import { ok, err, type Result } from '@/lib/result';

type TrendBucket = {
  windowDays: number;
  jobsCount: number;
  invoicedCents: number;
  paidCents: number;
  profitCents: number;
  onTimeRate: number | null;
};

export type ClientPerformanceSummary = {
  totals: {
    totalJobs: number;
    completedJobs: number;
    activeJobs: number;
    totalInvoicedCents: number;
    totalPaidCents: number;
    outstandingCents: number;
    totalProfitCents: number;
    avgMarginPercent: number | null;
  };
  time: {
    avgDaysToComplete: number | null;
    onTimeRate: number | null;
  };
  risk: {
    atRiskCount: number;
  };
  trends: TrendBucket[];
};

type JobRow = {
  id: string;
  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  scheduledEnd: Date | null;
  profitabilityStatus: string | null;
  qualitySafetyFlag: boolean | null;
  qualityCallbackFlag: boolean | null;
};

const ACTIVE_JOB_STATUSES = new Set(['scheduled', 'in_progress', 'unassigned']);

function daysBetween(start: Date, end: Date): number {
  const diff = end.getTime() - start.getTime();
  return diff / (1000 * 60 * 60 * 24);
}

function computeOnTimeRate(rows: JobRow[]): number | null {
  const completedWithSchedule = rows.filter(
    (job) => job.status === 'completed' && job.scheduledEnd && job.updatedAt
  );
  if (completedWithSchedule.length === 0) return null;
  const onTime = completedWithSchedule.filter(
    (job) => (job.updatedAt as Date).getTime() <= (job.scheduledEnd as Date).getTime()
  );
  return Number((onTime.length / completedWithSchedule.length).toFixed(2));
}

export async function getClientPerformance(params: {
  orgId: string;
  clientId: string;
  actor?: RequestActor;
}): Promise<Result<ClientPerformanceSummary>> {
  try {
    const db = getDb();
    const baseWhere = and(eq(jobs.orgId, params.orgId), eq(jobs.clientId, params.clientId));
    const where = params.actor ? applyJobVisibility(baseWhere, params.actor) : baseWhere;

    const jobRows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        scheduledEnd: jobs.scheduledEnd,
        profitabilityStatus: jobs.profitabilityStatus,
        qualitySafetyFlag: jobs.qualitySafetyFlag,
        qualityCallbackFlag: jobs.qualityCallbackFlag,
      })
      .from(jobs)
      .where(where);

    if (jobRows.length === 0) {
      return ok({
        totals: {
          totalJobs: 0,
          completedJobs: 0,
          activeJobs: 0,
          totalInvoicedCents: 0,
          totalPaidCents: 0,
          outstandingCents: 0,
          totalProfitCents: 0,
          avgMarginPercent: null,
        },
        time: {
          avgDaysToComplete: null,
          onTimeRate: null,
        },
        risk: {
          atRiskCount: 0,
        },
        trends: [
          { windowDays: 30, jobsCount: 0, invoicedCents: 0, paidCents: 0, profitCents: 0, onTimeRate: null },
          { windowDays: 90, jobsCount: 0, invoicedCents: 0, paidCents: 0, profitCents: 0, onTimeRate: null },
        ],
      });
    }

    const jobIds = jobRows.map((job) => job.id);
    const invoices = await db
      .select({
        jobId: jobInvoices.jobId,
        totalCents: jobInvoices.totalCents,
        amountCents: jobInvoices.amountCents,
        status: jobInvoices.status,
      })
      .from(jobInvoices)
      .where(and(eq(jobInvoices.orgId, params.orgId), inArray(jobInvoices.jobId, jobIds)));

    const payments = await db
      .select({
        jobId: jobPayments.jobId,
        amountCents: jobPayments.amountCents,
        status: jobPayments.status,
      })
      .from(jobPayments)
      .where(and(eq(jobPayments.orgId, params.orgId), inArray(jobPayments.jobId, jobIds)));

    const invoicedByJob = new Map<string, number>();
    let totalInvoicedCents = 0;
    for (const row of invoices) {
      const status = String(row.status ?? '').toLowerCase();
      if (!status || status === 'draft' || status === 'void') continue;
      const value = Number(row.totalCents ?? row.amountCents ?? 0);
      totalInvoicedCents += value;
      invoicedByJob.set(row.jobId, (invoicedByJob.get(row.jobId) ?? 0) + value);
    }

    const paidByJob = new Map<string, number>();
    let totalPaidCents = 0;
    for (const row of payments) {
      if (!isSuccessfulPaymentStatus(String(row.status ?? ''))) continue;
      const value = Number(row.amountCents ?? 0);
      totalPaidCents += value;
      paidByJob.set(row.jobId, (paidByJob.get(row.jobId) ?? 0) + value);
    }

    const profitabilityRows = await Promise.all(
      jobIds.map(async (jobId) => {
        const result = await getJobProfitability({ orgId: params.orgId, jobId });
        if (!result.ok) {
          return { jobId, profitCents: 0, marginPercent: null };
        }
        return {
          jobId,
          profitCents: result.data.profitCents,
          marginPercent: result.data.marginPercent,
        };
      })
    );

    const profitByJob = new Map(profitabilityRows.map((row) => [row.jobId, row.profitCents]));
    const marginValues = profitabilityRows
      .map((row) => row.marginPercent)
      .filter((value): value is number => value !== null);
    const avgMarginPercent =
      marginValues.length === 0
        ? null
        : Number((marginValues.reduce((sum, v) => sum + v, 0) / marginValues.length).toFixed(1));
    const totalProfitCents = profitabilityRows.reduce((sum, row) => sum + row.profitCents, 0);

    const completedJobs = jobRows.filter((job) => job.status === 'completed');
    const activeJobs = jobRows.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));

    const completionDurations = completedJobs
      .filter((job) => job.createdAt && job.updatedAt)
      .map((job) => daysBetween(job.createdAt as Date, job.updatedAt as Date))
      .filter((value) => Number.isFinite(value));

    const avgDaysToComplete =
      completionDurations.length === 0
        ? null
        : Number((completionDurations.reduce((sum, v) => sum + v, 0) / completionDurations.length).toFixed(1));

    const onTimeRate = computeOnTimeRate(jobRows);

    const atRiskCount = jobRows.filter(
      (job) =>
        job.status !== 'completed' &&
        (job.profitabilityStatus === 'critical' || job.qualitySafetyFlag || job.qualityCallbackFlag)
    ).length;

    const now = new Date();
    const windows = [30, 90];
    const trends: TrendBucket[] = windows.map((windowDays) => {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - windowDays);
      const windowJobs = jobRows.filter((job) => (job.createdAt ? job.createdAt >= cutoff : false));
      const windowJobIds = new Set(windowJobs.map((job) => job.id));

      let invoicedCents = 0;
      let paidCents = 0;
      let profitCents = 0;

      windowJobIds.forEach((jobId) => {
        invoicedCents += invoicedByJob.get(jobId) ?? 0;
        paidCents += paidByJob.get(jobId) ?? 0;
        profitCents += profitByJob.get(jobId) ?? 0;
      });

      return {
        windowDays,
        jobsCount: windowJobs.length,
        invoicedCents,
        paidCents,
        profitCents,
        onTimeRate: computeOnTimeRate(windowJobs),
      };
    });

    return ok({
      totals: {
        totalJobs: jobRows.length,
        completedJobs: completedJobs.length,
        activeJobs: activeJobs.length,
        totalInvoicedCents,
        totalPaidCents,
        outstandingCents: Math.max(0, totalInvoicedCents - totalPaidCents),
        totalProfitCents,
        avgMarginPercent,
      },
      time: {
        avgDaysToComplete,
        onTimeRate,
      },
      risk: {
        atRiskCount,
      },
      trends,
    });
  } catch (error) {
    console.error('Error computing client performance:', error);
    return err('INTERNAL_ERROR', 'Failed to compute client performance', error);
  }
}
