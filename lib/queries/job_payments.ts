import { and, desc, eq } from 'drizzle-orm';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { jobPayments } from '@/db/schema/job_payments';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import type { JobPayment } from '@/db/schema/job_payments';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';

export async function listJobPayments(params: {
  orgId: string;
  jobId?: string;
  invoiceId?: string;
  limit?: number;
  actor?: RequestActor;
}): Promise<Result<JobPayment[]>> {
  try {
    const rows = await withIntegrationOrgScope(params.orgId, async (db) => {
      const baseWhere = params.jobId
        ? and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.jobId, params.jobId))
        : params.invoiceId
          ? and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.invoiceId, params.invoiceId))
          : eq(jobPayments.orgId, params.orgId);
      const jobVisibility = params.actor ? applyJobVisibility(eq(jobs.orgId, params.orgId), params.actor, jobs) : null;
      const whereClause = jobVisibility ? and(baseWhere, jobVisibility) : baseWhere;

      return await db
        .select({
          id: jobPayments.id,
          orgId: jobPayments.orgId,
          jobId: jobPayments.jobId,
          invoiceId: jobPayments.invoiceId,
          provider: jobPayments.provider,
          method: jobPayments.method,
          amountCents: jobPayments.amountCents,
          currency: jobPayments.currency,
          status: jobPayments.status,
          paymentLinkUrl: jobPayments.paymentLinkUrl,
          providerPaymentId: jobPayments.providerPaymentId,
          providerInvoiceId: jobPayments.providerInvoiceId,
          stripePaymentLinkId: jobPayments.stripePaymentLinkId,
          stripeCheckoutSessionId: jobPayments.stripeCheckoutSessionId,
          reference: jobPayments.reference,
          notes: jobPayments.notes,
          paidAt: jobPayments.paidAt,
          idempotencyKey: jobPayments.idempotencyKey,
          integrationEventId: jobPayments.integrationEventId,
          createdBy: jobPayments.createdBy,
          updatedBy: jobPayments.updatedBy,
          createdAt: jobPayments.createdAt,
          updatedAt: jobPayments.updatedAt,
        })
        .from(jobPayments)
        .innerJoin(jobs, eq(jobs.id, jobPayments.jobId))
        .where(whereClause)
        .orderBy(desc(jobPayments.createdAt))
        .limit(params.limit ?? 50);
    });

    return ok(rows);
  } catch (error) {
    console.error('Error listing job payments:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch payments', error);
  }
}

export async function getLatestJobPayment(params: {
  orgId: string;
  jobId: string;
}): Promise<Result<JobPayment | null>> {
  try {
    const row = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [found] = await db
        .select()
        .from(jobPayments)
        .where(and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.jobId, params.jobId)))
        .orderBy(desc(jobPayments.createdAt))
        .limit(1);
      return found ?? null;
    });
    return ok(row ?? null);
  } catch (error) {
    console.error('Error getting latest payment:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch payment', error);
  }
}
