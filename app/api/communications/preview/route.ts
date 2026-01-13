import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { applyJobVisibility, canManageTemplates } from '@/lib/authz';
import { withCommOrgScope } from '@/lib/communications/scope';
import { commTemplates } from '@/db/schema/comm_templates';
import { commEvents } from '@/db/schema/comm_events';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { jobs } from '@/db/schema/jobs';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import { jobContacts } from '@/db/schema/job_contacts';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobPayments } from '@/db/schema/job_payments';
import { announcements } from '@/db/schema/announcements';
import { assignmentToDateRange } from '@/lib/utils/scheduleTime';
import { renderEmailHtml, renderTemplate } from '@/lib/communications/renderer';

function formatAddress(job: any): string {
  const parts = [
    job.addressLine1,
    job.addressLine2,
    job.suburb,
    job.state,
    job.postcode,
  ]
    .map((part: string | null | undefined) => (part ? String(part).trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
}

function buildAppLink(params: { entityType: string; entityId: string; orgId: string; jobId?: string | null }): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const orgQuery = `?orgId=${params.orgId}`;
  if (params.entityType === 'job') {
    return `${baseUrl}/jobs/${params.entityId}${orgQuery}`;
  }
  if (params.entityType === 'invoice' || params.entityType === 'payment') {
    const jobId = params.jobId || params.entityId;
    return `${baseUrl}/jobs/${jobId}${orgQuery}`;
  }
  if (params.entityType === 'announcement') {
    return `${baseUrl}/announcements${orgQuery}`;
  }
  return `${baseUrl}${orgQuery}`;
}

function buildMapsLink(address: string | null): string | null {
  if (!address) return null;
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

function mergeDeep(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  if (!source || typeof source !== 'object') return target;
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nextTarget = (target[key] ?? {}) as Record<string, any>;
      target[key] = mergeDeep(nextTarget, value as Record<string, any>);
    } else {
      target[key] = value;
    }
  }
  return target;
}

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageTemplates(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const eventId = typeof body?.eventId === 'string' ? body.eventId : null;
  let entityType = typeof body?.entityType === 'string' ? body.entityType : '';
  let entityId = typeof body?.entityId === 'string' ? body.entityId : '';
  let payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

  return await withCommOrgScope({ orgId: context.data.orgId, roleKey: 'system' }, async (db) => {
    let template = null;
    if (typeof body?.templateId === 'string') {
      [template] = await db
        .select()
        .from(commTemplates)
        .where(and(eq(commTemplates.orgId, context.data.orgId), eq(commTemplates.id, body.templateId)))
        .limit(1);
    } else if (typeof body?.eventKey === 'string' && typeof body?.channel === 'string') {
      [template] = await db
        .select()
        .from(commTemplates)
        .where(
          and(
            eq(commTemplates.orgId, context.data.orgId),
            eq(commTemplates.key, body.eventKey),
            eq(commTemplates.channel, body.channel)
          )
        )
        .orderBy(desc(commTemplates.version))
        .limit(1);
    }

    if (!template) return err('NOT_FOUND', 'Template not found');

    if (eventId) {
      const [eventRow] = await db
        .select()
        .from(commEvents)
        .where(and(eq(commEvents.orgId, context.data.orgId), eq(commEvents.id, eventId)))
        .limit(1);
      if (!eventRow) return err('NOT_FOUND', 'Event not found');
      entityType = entityType || eventRow.entityType;
      entityId = entityId || eventRow.entityId;
      payload = { ...(eventRow.payload ?? {}), ...(payload ?? {}) };
    }

    if (!entityType || !entityId) return err('VALIDATION_ERROR', 'entityType and entityId are required');

    const [orgRow] = await db
      .select({ name: orgs.name, commFromEmail: orgSettings.commFromEmail })
      .from(orgs)
      .leftJoin(orgSettings, eq(orgSettings.orgId, orgs.id))
      .where(eq(orgs.id, context.data.orgId))
      .limit(1);

    let jobRow: any = null;
    let schedule = null as null | { scheduledStart: Date; scheduledEnd: Date };
    let client = null as any;
    let clientContacts: any[] = [];
    let siteContacts: any[] = [];
    let invoiceRow: any = null;
    let paymentRow: any = null;
    let announcementRow: any = null;

    if (entityType === 'job') {
      const jobWhere = applyJobVisibility(
        and(eq(jobs.orgId, context.data.orgId), eq(jobs.id, entityId)),
        context.data.actor,
        jobs
      );
      [jobRow] = await db
        .select()
        .from(jobs)
        .where(jobWhere)
        .limit(1);
      if (!jobRow) return err('NOT_FOUND', 'Job not found');
      const [assignment] = await db
        .select()
        .from(scheduleAssignments)
        .where(and(eq(scheduleAssignments.orgId, context.data.orgId), eq(scheduleAssignments.jobId, entityId)))
        .limit(1);
      if (assignment) {
        schedule = assignmentToDateRange(new Date(assignment.date), assignment.startMinutes, assignment.endMinutes);
      }
      const contacts = await db
        .select()
        .from(jobContacts)
        .where(and(eq(jobContacts.orgId, context.data.orgId), eq(jobContacts.jobId, entityId)));
      clientContacts = contacts.filter((c: any) => String(c.role ?? '').toLowerCase() === 'client');
      siteContacts = contacts.filter((c: any) => String(c.role ?? '').toLowerCase().includes('site'));
      client = clientContacts[0] || contacts[0] || null;
    }

    if (entityType === 'invoice') {
      [invoiceRow] = await db
        .select()
        .from(jobInvoices)
        .where(and(eq(jobInvoices.orgId, context.data.orgId), eq(jobInvoices.id, entityId)))
        .limit(1);
      if (invoiceRow) {
        const jobWhere = applyJobVisibility(
          and(eq(jobs.orgId, context.data.orgId), eq(jobs.id, invoiceRow.jobId)),
          context.data.actor,
          jobs
        );
        [jobRow] = await db
          .select()
          .from(jobs)
          .where(jobWhere)
          .limit(1);
        if (!jobRow) return err('NOT_FOUND', 'Job not found');
      }
    }

    if (entityType === 'payment') {
      [paymentRow] = await db
        .select()
        .from(jobPayments)
        .where(and(eq(jobPayments.orgId, context.data.orgId), eq(jobPayments.id, entityId)))
        .limit(1);
      if (paymentRow) {
        const jobWhere = applyJobVisibility(
          and(eq(jobs.orgId, context.data.orgId), eq(jobs.id, paymentRow.jobId)),
          context.data.actor,
          jobs
        );
        [jobRow] = await db
          .select()
          .from(jobs)
          .where(jobWhere)
          .limit(1);
        if (!jobRow) return err('NOT_FOUND', 'Job not found');
      }
    }

    if (entityType === 'announcement') {
      [announcementRow] = await db
        .select()
        .from(announcements)
        .where(and(eq(announcements.orgId, context.data.orgId), eq(announcements.id, entityId)))
        .limit(1);
    }

    const address = jobRow ? formatAddress(jobRow) : null;
    const baseVariables: Record<string, any> = {
      org: {
        name: orgRow?.name ?? 'Organisation',
        email: orgRow?.commFromEmail ?? null,
      },
      actor: {
        name: context.data.session.user.name ?? context.data.session.user.email,
        role: context.data.actor.roleKey,
        email: context.data.session.user.email,
      },
      recipient: {
        name: context.data.session.user.name ?? context.data.session.user.email,
        email: context.data.session.user.email,
      },
      now: new Date().toISOString(),
      links: {
        appEntityUrl: buildAppLink({
          entityType,
          entityId,
          orgId: context.data.orgId,
          jobId: jobRow?.id ?? null,
        }),
        mapsUrl: address ? buildMapsLink(address) : null,
      },
      job: jobRow
        ? {
            id: jobRow.id,
            title: jobRow.title,
            status: jobRow.status,
            scheduledStart: schedule?.scheduledStart?.toISOString?.() ?? jobRow.scheduledStart?.toISOString?.() ?? null,
            scheduledEnd: schedule?.scheduledEnd?.toISOString?.() ?? jobRow.scheduledEnd?.toISOString?.() ?? null,
            address,
            notesSummary: jobRow.notes ?? null,
          }
        : null,
      client: client
        ? {
            name: client.name ?? null,
            email: client.email ?? null,
            phone: client.phone ?? null,
          }
        : null,
      clientContacts,
      siteContacts,
      invoice: invoiceRow
        ? {
            id: invoiceRow.id,
            number:
              invoiceRow.invoiceNumber ??
              invoiceRow.externalRef ??
              invoiceRow.xeroInvoiceId ??
              invoiceRow.id.slice(0, 8),
            total: invoiceRow.amountCents
              ? `${invoiceRow.currency} ${((invoiceRow.totalCents ?? invoiceRow.amountCents) / 100).toFixed(2)}`
              : null,
            dueDate: invoiceRow.dueAt?.toISOString?.() ?? invoiceRow.issuedAt?.toISOString?.() ?? invoiceRow.sentAt?.toISOString?.() ?? null,
            status: invoiceRow.status,
            pdfUrl: invoiceRow.pdfUrl ?? null,
            paymentUrl: paymentRow?.paymentLinkUrl ?? null,
            paidAt: invoiceRow.paidAt?.toISOString?.() ?? null,
          }
        : null,
      payment: paymentRow
        ? {
            id: paymentRow.id,
            status: paymentRow.status,
            amount: paymentRow.amountCents ? `${paymentRow.currency} ${(paymentRow.amountCents / 100).toFixed(2)}` : null,
            paymentUrl: paymentRow.paymentLinkUrl ?? null,
            method: paymentRow.method ?? null,
            reference: paymentRow.reference ?? null,
          }
        : null,
      announcement: announcementRow
        ? {
            title: announcementRow.title,
            body: announcementRow.message,
            urgent: announcementRow.priority === 'urgent',
            publishedAt: announcementRow.createdAt?.toISOString?.() ?? null,
          }
        : null,
      materialsSummary: (payload as any)?.materialsSummary ?? (payload as any)?.materials ?? [],
    };

    const variables = mergeDeep(baseVariables, payload as Record<string, any>);

    const subjectResult = template.subject ? renderTemplate(template.subject, variables) : null;
    const bodyTextResult = renderTemplate(template.body, variables);
    const htmlResult = template.bodyHtml
      ? renderTemplate(template.bodyHtml, variables)
      : { rendered: renderEmailHtml(bodyTextResult.rendered), missing: [] as string[] };

    return ok({
      subject: subjectResult?.rendered ?? null,
      bodyText: bodyTextResult.rendered,
      bodyHtml: htmlResult.rendered,
      missingVars: Array.from(
        new Set([...(subjectResult?.missing ?? []), ...bodyTextResult.missing, ...htmlResult.missing])
      ),
    });
  });
});
