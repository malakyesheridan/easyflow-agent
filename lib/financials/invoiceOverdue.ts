import { and, eq, gte, lt, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orgs } from '@/db/schema/orgs';
import { commEvents } from '@/db/schema/comm_events';
import { jobInvoices } from '@/db/schema/job_invoices';
import { emitCommEvent } from '@/lib/communications/emit';
import { emitAppEvent } from '@/lib/integrations/events/emit';

type OverdueResult = {
  orgId: string;
  scanned: number;
  emitted: number;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function runInvoiceOverdueCheck(params: {
  orgId?: string;
  now?: Date;
  source?: 'cron' | 'api';
}): Promise<OverdueResult[]> {
  const db = getDb();
  const now = params.now ?? new Date();
  const orgIds = params.orgId
    ? [params.orgId]
    : (await db.select({ id: orgs.id }).from(orgs)).map((row) => row.id);

  const results: OverdueResult[] = [];

  for (const orgId of orgIds) {
    const dayStart = startOfDay(now);
    const existing = await db
      .select({ entityId: commEvents.entityId })
      .from(commEvents)
      .where(
        and(
          eq(commEvents.orgId, orgId),
          eq(commEvents.eventKey, 'invoice_overdue'),
          gte(commEvents.createdAt, dayStart)
        )
      );
    const alreadyNotified = new Set(existing.map((row) => row.entityId));

    const overdueInvoices = await db
      .select({
        id: jobInvoices.id,
        jobId: jobInvoices.jobId,
        status: jobInvoices.status,
        dueAt: jobInvoices.dueAt,
        amountCents: jobInvoices.amountCents,
        totalCents: jobInvoices.totalCents,
        currency: jobInvoices.currency,
      })
      .from(jobInvoices)
      .where(
        and(
          eq(jobInvoices.orgId, orgId),
          lt(jobInvoices.dueAt, now),
          notInArray(jobInvoices.status, ['paid', 'void', 'draft'])
        )
      );

    let emitted = 0;
    for (const invoice of overdueInvoices) {
      if (alreadyNotified.has(invoice.id)) continue;
      const amountCents = invoice.totalCents ?? invoice.amountCents ?? 0;

      void emitCommEvent({
        orgId,
        eventKey: 'invoice_overdue',
        entityType: 'invoice',
        entityId: invoice.id,
        triggeredByUserId: null,
        source: params.source ?? 'cron',
        payload: {
          invoiceId: invoice.id,
          jobId: invoice.jobId,
          amountCents,
          currency: invoice.currency,
          dueAt: invoice.dueAt?.toISOString?.() ?? null,
          status: invoice.status,
        },
      });
      void emitAppEvent({
        orgId,
        eventType: 'invoice.overdue',
        payload: {
          jobId: invoice.jobId,
          invoiceId: invoice.id,
          amountCents,
          currency: invoice.currency,
        },
      });
      emitted += 1;
    }

    results.push({ orgId, scanned: overdueInvoices.length, emitted });
  }

  return results;
}
