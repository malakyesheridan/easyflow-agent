import { and, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { jobPayments } from '@/db/schema/job_payments';
import { jobInvoices } from '@/db/schema/job_invoices';
import { materialAlerts } from '@/db/schema/material_alerts';
import { integrationEvents } from '@/db/schema/integration_events';
import { integrations } from '@/db/schema/integrations';
import { ok, err, type Result } from '@/lib/result';

export type IntegrationMetrics = {
  payments: { totalCents: number; count: number };
  outstandingInvoices: number;
  lowStockAlerts: number;
  failedEvents: number;
};

export async function getIntegrationMetrics(params: { orgId: string; since: Date }): Promise<Result<IntegrationMetrics>> {
  try {
    const since = params.since;
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [paymentsRow] = await db
        .select({
          totalCents: sql<number>`coalesce(sum(${jobPayments.amountCents}), 0)`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(jobPayments)
        .where(
          and(
            eq(jobPayments.orgId, params.orgId),
            eq(jobPayments.provider, 'stripe'),
            eq(jobPayments.status, 'paid'),
            gte(jobPayments.paidAt, since)
          )
        );

      const [invoiceRow] = await db
        .select({
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(jobInvoices)
        .where(
          and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.provider, 'xero'), ne(jobInvoices.status, 'paid'))
        );

      const [alertRow] = await db
        .select({
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(materialAlerts)
        .where(
          and(
            eq(materialAlerts.orgId, params.orgId),
            eq(materialAlerts.type, 'low_stock'),
            isNull(materialAlerts.resolvedAt)
          )
        );

      const [failedRow] = await db
        .select({
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(integrationEvents)
        .innerJoin(integrations, eq(integrationEvents.integrationId, integrations.id))
        .where(
          and(
            eq(integrations.orgId, params.orgId),
            eq(integrationEvents.status, 'failed'),
            gte(integrationEvents.createdAt, since)
          )
        );

      return {
        payments: {
          totalCents: paymentsRow?.totalCents ?? 0,
          count: paymentsRow?.count ?? 0,
        },
        outstandingInvoices: invoiceRow?.count ?? 0,
        lowStockAlerts: alertRow?.count ?? 0,
        failedEvents: failedRow?.count ?? 0,
      };
    });

    return ok(result);
  } catch (error) {
    console.error('Error fetching integration metrics:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch integration metrics', error);
  }
}
