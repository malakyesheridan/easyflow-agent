import { and, eq } from 'drizzle-orm';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { jobPayments, type JobPayment, type NewJobPayment } from '@/db/schema/job_payments';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import { emitCommEvent } from '@/lib/communications/emit';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { evaluateJobGuardrailsBestEffort } from '@/lib/financials/jobProfitability';
import { isSuccessfulPaymentStatus, recalculateInvoiceStatus } from '@/lib/financials/invoiceState';
import { allowDemoBilling } from '@/lib/financials/demoBilling';

export async function createJobPayment(params: {
  orgId: string;
  jobId: string;
  invoiceId?: string | null;
  provider: string;
  method?: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paymentLinkUrl?: string | null;
  providerPaymentId?: string | null;
  providerInvoiceId?: string | null;
  stripePaymentLinkId?: string | null;
  stripeCheckoutSessionId?: string | null;
  paidAt?: Date | null;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  integrationEventId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}): Promise<Result<JobPayment>> {
  try {
    const row = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [job] = await db
        .select({ isDemo: jobs.isDemo })
        .from(jobs)
        .where(and(eq(jobs.orgId, params.orgId), eq(jobs.id, params.jobId)))
        .limit(1);

      if (!job) return { demoBlocked: false, record: null };
      if (job.isDemo && !allowDemoBilling()) return { demoBlocked: true, record: null };

      if (params.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(jobPayments)
          .where(and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.idempotencyKey, params.idempotencyKey)))
          .limit(1);
        if (existing) return { demoBlocked: false, record: existing };
      }

      const values: NewJobPayment = {
        orgId: params.orgId,
        jobId: params.jobId,
        invoiceId: params.invoiceId ?? null,
        provider: params.provider,
        method: params.method ?? 'stripe_card',
        amountCents: params.amountCents,
        currency: params.currency,
        status: params.status,
        paymentLinkUrl: params.paymentLinkUrl ?? null,
        providerPaymentId: params.providerPaymentId ?? null,
        providerInvoiceId: params.providerInvoiceId ?? null,
        stripePaymentLinkId: params.stripePaymentLinkId ?? null,
        stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
        reference: params.reference ?? null,
        notes: params.notes ?? null,
        paidAt: params.paidAt ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        integrationEventId: params.integrationEventId ?? null,
        createdBy: params.createdBy ?? null,
        updatedBy: params.updatedBy ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      const [inserted] = await db.insert(jobPayments).values(values).returning();
      let invoiceStatus = null as Awaited<ReturnType<typeof recalculateInvoiceStatus>> | null;
      if (inserted?.invoiceId) {
        invoiceStatus = await recalculateInvoiceStatus({
          db,
          orgId: params.orgId,
          invoiceId: inserted.invoiceId,
        });
      }
      return { demoBlocked: false, record: inserted ?? null, invoiceStatus };
    });

    if (row.demoBlocked) return err('VALIDATION_ERROR', 'Demo jobs are excluded from billing');
    if (!row.record) return err('NOT_FOUND', 'Job not found');
    const record = row.record;
    if (record.paymentLinkUrl) {
      void emitCommEvent({
        orgId: record.orgId,
        eventKey: 'payment_link_sent',
        entityType: 'payment',
        entityId: record.id,
        triggeredByUserId: null,
        source: 'integration',
        payload: {
          paymentId: record.id,
          jobId: record.jobId,
          status: record.status,
          amountCents: record.amountCents,
          currency: record.currency,
          paymentUrl: record.paymentLinkUrl,
        },
      });
    }
    if (isSuccessfulPaymentStatus(record.status)) {
      void emitCommEvent({
        orgId: record.orgId,
        eventKey: 'payment_received',
        entityType: 'payment',
        entityId: record.id,
        triggeredByUserId: null,
        source: 'integration',
        payload: {
          paymentId: record.id,
          jobId: record.jobId,
          status: record.status,
          amountCents: record.amountCents,
          currency: record.currency,
        },
      });
      void emitAppEvent({
        orgId: record.orgId,
        eventType: 'payment.received',
        payload: {
          jobId: record.jobId,
          paymentId: record.id,
          invoiceId: record.invoiceId ?? undefined,
          amountCents: record.amountCents,
          currency: record.currency,
          method: record.method ?? undefined,
        },
      });
      if (record.provider === 'external') {
        void emitCommEvent({
          orgId: record.orgId,
          eventKey: 'payment_recorded',
          entityType: 'payment',
          entityId: record.id,
          triggeredByUserId: null,
          source: 'app',
          payload: {
            paymentId: record.id,
            jobId: record.jobId,
            invoiceId: record.invoiceId ?? undefined,
            status: record.status,
            amountCents: record.amountCents,
            currency: record.currency,
            method: record.method,
            reference: record.reference ?? null,
          },
        });
        void emitAppEvent({
          orgId: record.orgId,
          eventType: 'payment.recorded',
          payload: {
            jobId: record.jobId,
            paymentId: record.id,
            invoiceId: record.invoiceId ?? undefined,
            amountCents: record.amountCents,
            currency: record.currency,
            method: record.method ?? undefined,
          },
        });
      }
      void evaluateJobGuardrailsBestEffort({ orgId: record.orgId, jobId: record.jobId });
    }
    if (row.invoiceStatus?.statusChanged && row.invoiceStatus.status === 'paid') {
      void emitCommEvent({
        orgId: record.orgId,
        eventKey: 'invoice_paid',
        entityType: 'invoice',
        entityId: row.invoiceStatus.invoiceId,
        triggeredByUserId: null,
        source: 'app',
        payload: {
          invoiceId: row.invoiceStatus.invoiceId,
          jobId: record.jobId,
          totalCents: row.invoiceStatus.totalCents,
          paidCents: row.invoiceStatus.paidCents,
          currency: record.currency,
        },
      });
      void emitAppEvent({
        orgId: record.orgId,
        eventType: 'invoice.paid',
        payload: {
          jobId: record.jobId,
          invoiceId: row.invoiceStatus.invoiceId,
          amountCents: row.invoiceStatus.totalCents,
          currency: record.currency,
        },
      });
    }
    return ok(record);
  } catch (error) {
    console.error('Error creating payment:', error);
    return err('INTERNAL_ERROR', 'Failed to create payment', error);
  }
}

export async function updateJobPaymentStatus(params: {
  orgId: string;
  id: string;
  status: string;
  providerPaymentId?: string | null;
  stripeCheckoutSessionId?: string | null;
  paidAt?: Date | null;
  updatedBy?: string | null;
}): Promise<Result<JobPayment>> {
  try {
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [before] = await db
        .select()
        .from(jobPayments)
        .where(and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.id, params.id)))
        .limit(1);

      if (!before) return { before: null, updated: null };

      const [updated] = await db
        .update(jobPayments)
        .set({
          status: params.status,
          providerPaymentId: params.providerPaymentId ?? undefined,
          stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? undefined,
          paidAt: params.paidAt ?? undefined,
          updatedBy: params.updatedBy ?? undefined,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.id, params.id)))
        .returning();
      let invoiceStatus = null as Awaited<ReturnType<typeof recalculateInvoiceStatus>> | null;
      if (updated?.invoiceId) {
        invoiceStatus = await recalculateInvoiceStatus({
          db,
          orgId: params.orgId,
          invoiceId: updated.invoiceId,
        });
      }
      return { before, updated: updated ?? null, invoiceStatus };
    });

    if (!result?.updated) return err('NOT_FOUND', 'Payment not found');

    if (
      result.before &&
      result.before.status !== result.updated.status &&
      isSuccessfulPaymentStatus(result.updated.status)
    ) {
      void emitCommEvent({
        orgId: result.updated.orgId,
        eventKey: 'payment_received',
        entityType: 'payment',
        entityId: result.updated.id,
        triggeredByUserId: null,
        source: 'integration',
        payload: {
          paymentId: result.updated.id,
          jobId: result.updated.jobId,
          status: result.updated.status,
          amountCents: result.updated.amountCents,
          currency: result.updated.currency,
        },
      });
      void emitAppEvent({
        orgId: result.updated.orgId,
        eventType: 'payment.received',
        payload: {
          jobId: result.updated.jobId,
          paymentId: result.updated.id,
          invoiceId: result.updated.invoiceId ?? undefined,
          amountCents: result.updated.amountCents,
          currency: result.updated.currency,
          method: result.updated.method ?? undefined,
        },
      });
      void evaluateJobGuardrailsBestEffort({ orgId: result.updated.orgId, jobId: result.updated.jobId });
    }

    if (result.invoiceStatus?.statusChanged && result.invoiceStatus.status === 'paid') {
      void emitCommEvent({
        orgId: result.updated.orgId,
        eventKey: 'invoice_paid',
        entityType: 'invoice',
        entityId: result.invoiceStatus.invoiceId,
        triggeredByUserId: null,
        source: 'app',
        payload: {
          invoiceId: result.invoiceStatus.invoiceId,
          jobId: result.updated.jobId,
          totalCents: result.invoiceStatus.totalCents,
          paidCents: result.invoiceStatus.paidCents,
          currency: result.updated.currency,
        },
      });
      void emitAppEvent({
        orgId: result.updated.orgId,
        eventType: 'invoice.paid',
        payload: {
          jobId: result.updated.jobId,
          invoiceId: result.invoiceStatus.invoiceId,
          amountCents: result.invoiceStatus.totalCents,
          currency: result.updated.currency,
        },
      });
    }

    return ok(result.updated);
  } catch (error) {
    console.error('Error updating payment:', error);
    return err('INTERNAL_ERROR', 'Failed to update payment', error);
  }
}
