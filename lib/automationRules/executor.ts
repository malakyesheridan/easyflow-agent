import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { automationRuleRunSteps } from '@/db/schema/automation_rule_run_steps';
import { commOutbox } from '@/db/schema/comm_outbox';
import { commTemplates } from '@/db/schema/comm_templates';
import { jobs } from '@/db/schema/jobs';
import { tasks } from '@/db/schema/tasks';
import { workTemplates } from '@/db/schema/work_templates';
import { workTemplateSteps } from '@/db/schema/work_template_steps';
import { jobInvoices } from '@/db/schema/job_invoices';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { emitCommEvent } from '@/lib/communications/emit';
import { renderTemplate } from '@/lib/communications/renderer';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { getBaseUrl } from '@/lib/url';
import type { RuleAction, TriggerKey } from './types';

type DbClient = {
  select: any;
  insert: any;
  update: any;
};

type CommRuleAction = Extract<RuleAction, { type: 'comm.send_email' | 'comm.send_sms' | 'comm.send_inapp' }>;

function isCommRuleAction(action: RuleAction): action is CommRuleAction {
  return action.type === 'comm.send_email' || action.type === 'comm.send_sms' || action.type === 'comm.send_inapp';
}

type AutomationContext = {
  job: Record<string, unknown> | null;
  assignment: Record<string, unknown> | null;
  material: Record<string, unknown> | null;
  contacts: { client: Record<string, unknown> | null; siteContacts: Record<string, unknown>[] };
  crew: Record<string, unknown>[];
  org: { settings: Record<string, unknown> | null };
  orgUsers: Array<{ userId: string; name: string | null; email: string | null; roleKey: string | null; crewMemberId: string | null }>;
  computed: Record<string, unknown>;
};

type RuleExecutionContext = {
  orgId: string;
  runId: string;
  ruleId: string;
  ruleName: string;
  triggerKey: TriggerKey;
  event: { id: string; payload: Record<string, unknown>; createdAt?: Date | null; actorUserId?: string | null };
  context: AutomationContext;
};

type ActionResult = {
  status: 'succeeded' | 'failed' | 'skipped';
  result?: Record<string, unknown> | null;
  commPreview?: Record<string, unknown> | null;
  error?: string | null;
  errorDetails?: Record<string, unknown> | null;
};

type CommRecipient = {
  type: 'client' | 'user' | 'custom';
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  roleKey?: string | null;
  crewMemberId?: string | null;
};

function formatAddress(job: any): string {
  const parts = [job?.addressLine1, job?.addressLine2, job?.suburb, job?.state, job?.postcode]
    .map((part) => (part ? String(part).trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
}

function formatCrewName(member: any): string {
  if (member?.displayName) return String(member.displayName);
  const first = member?.firstName ? String(member.firstName) : '';
  const last = member?.lastName ? String(member.lastName) : '';
  return [first, last].filter(Boolean).join(' ').trim();
}

function formatCurrency(amountCents?: number | null, currency?: string | null): string {
  if (amountCents === null || amountCents === undefined) return '';
  const amount = (amountCents / 100).toFixed(2);
  return `${currency || 'AUD'} ${amount}`;
}

function buildAppLink(params: {
  entityType: string;
  entityId: string;
  orgId: string;
  jobId?: string | null;
  contactId?: string | null;
  appraisalId?: string | null;
  listingId?: string | null;
  reportId?: string | null;
  reportToken?: string | null;
}): string {
  const baseUrl = getBaseUrl();
  const orgQuery = `?orgId=${params.orgId}`;
  if (params.entityType === 'announcement') {
    return `${baseUrl}/announcements${orgQuery}`;
  }
  if (params.entityType === 'contact' || params.contactId) {
    const contactId = params.entityType === 'contact' ? params.entityId : params.contactId;
    if (contactId) return `${baseUrl}/contacts/${contactId}${orgQuery}`;
  }
  if (params.entityType === 'appraisal' || params.appraisalId) {
    const appraisalId = params.entityType === 'appraisal' ? params.entityId : params.appraisalId;
    if (appraisalId) return `${baseUrl}/appraisals/${appraisalId}${orgQuery}`;
  }
  if (params.entityType === 'listing' || params.listingId) {
    const listingId = params.entityType === 'listing' ? params.entityId : params.listingId;
    if (listingId) return `${baseUrl}/listings/${listingId}${orgQuery}`;
  }
  if (params.entityType === 'report' || params.reportId || params.reportToken) {
    if (params.reportToken) return `${baseUrl}/reports/vendor/${params.reportToken}`;
    const reportId = params.entityType === 'report' ? params.entityId : params.reportId;
    if (reportId) return `${baseUrl}/reports${orgQuery}`;
  }
  const jobId = params.entityType === 'job' ? params.entityId : params.jobId;
  if (jobId) {
    return `${baseUrl}/jobs/${jobId}${orgQuery}`;
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

function resolveRecipients(target: RuleAction['type'], to: string, context: AutomationContext, action: RuleAction): CommRecipient[] {
  const recipients: CommRecipient[] = [];
  const orgUsers = context.orgUsers ?? [];

  if (target.startsWith('comm.send') && to === 'customer') {
    const client = context.contacts.client as any;
    if (client?.email || client?.phone) {
      recipients.push({ type: 'client', email: client.email ?? null, phone: client.phone ?? null, name: client.name ?? null });
    }
    if (!client && context.contacts.siteContacts.length > 0) {
      for (const contact of context.contacts.siteContacts) {
        const typed = contact as any;
        recipients.push({ type: 'custom', email: typed.email ?? null, phone: typed.phone ?? null, name: typed.name ?? null });
      }
    }
  }

  if (target.startsWith('comm.send') && to === 'admin') {
    for (const user of orgUsers) {
      const role = user.roleKey ? user.roleKey.toLowerCase() : '';
      if (role === 'admin' || role === 'manager') {
        recipients.push({
          type: 'user',
          userId: user.userId,
          email: user.email ?? null,
          name: user.name ?? null,
          roleKey: user.roleKey ?? null,
          crewMemberId: user.crewMemberId ?? null,
        });
      }
    }
  }

  if (target.startsWith('comm.send') && to === 'crew_assigned') {
    const crewIds = new Set(
      (context.crew ?? [])
        .map((crew) => (crew as any)?.id)
        .filter((id): id is string => typeof id === 'string')
    );
    for (const user of orgUsers) {
      if (user.crewMemberId && crewIds.has(user.crewMemberId)) {
        recipients.push({
          type: 'user',
          userId: user.userId,
          email: user.email ?? null,
          name: user.name ?? null,
          roleKey: user.roleKey ?? null,
          crewMemberId: user.crewMemberId ?? null,
        });
      }
    }
    for (const crewMember of context.crew ?? []) {
      const typed = crewMember as any;
      if (typed.email || typed.phone) {
        recipients.push({
          type: 'custom',
          email: typed.email ?? null,
          phone: typed.phone ?? null,
          name: typed.displayName ?? null,
          crewMemberId: typed.id ?? null,
        });
      }
    }
  }

  if (target.startsWith('comm.send') && to === 'ops') {
    for (const user of orgUsers) {
      recipients.push({
        type: 'user',
        userId: user.userId,
        email: user.email ?? null,
        name: user.name ?? null,
        roleKey: user.roleKey ?? null,
        crewMemberId: user.crewMemberId ?? null,
      });
    }
  }

  if (target.startsWith('comm.send') && to === 'custom') {
    if (action.type === 'comm.send_email' && action.customEmail) {
      recipients.push({ type: 'custom', email: action.customEmail, phone: null, name: action.customEmail });
    }
    if (action.type === 'comm.send_sms' && action.customPhone) {
      recipients.push({ type: 'custom', phone: action.customPhone, email: null, name: action.customPhone });
    }
  }

  const deduped = new Map<string, CommRecipient>();
  for (const recipient of recipients) {
    const key = recipient.userId ? `user:${recipient.userId}` : `contact:${recipient.email ?? recipient.phone ?? recipient.name ?? ''}`;
    if (!deduped.has(key)) deduped.set(key, recipient);
  }

  return Array.from(deduped.values());
}

async function loadOrgInfo(db: DbClient, orgId: string) {
  const [row] = await db
    .select({ name: orgs.name, commFromEmail: orgSettings.commFromEmail })
    .from(orgs)
    .leftJoin(orgSettings, eq(orgSettings.orgId, orgs.id))
    .where(eq(orgs.id, orgId))
    .limit(1);

  return {
    name: row?.name ?? 'Organisation',
    commFromEmail: row?.commFromEmail ?? null,
  };
}

async function buildCommPreview(params: {
  db: DbClient;
  orgId: string;
  action: CommRuleAction;
  context: AutomationContext;
  eventPayload: Record<string, unknown>;
  ruleName: string;
  triggerKey: TriggerKey;
  runId: string;
}): Promise<Record<string, unknown> | null> {
  const action = params.action;
  const channel = action.type === 'comm.send_email' ? 'email' : action.type === 'comm.send_sms' ? 'sms' : 'in_app';
  const templateKey = action.templateKey;

  const [templateRow] = await params.db
    .select({
      subject: commTemplates.subject,
      body: commTemplates.body,
      bodyHtml: commTemplates.bodyHtml,
    })
    .from(commTemplates)
    .where(and(eq(commTemplates.orgId, params.orgId), eq(commTemplates.key, templateKey), eq(commTemplates.channel, channel)))
    .orderBy(desc(commTemplates.version))
    .limit(1);

  if (!templateRow) return null;

  const orgInfo = await loadOrgInfo(params.db, params.orgId);
  const job = params.context.job as any;
  const address = job ? formatAddress(job) : null;
  const crewSummary = (params.context.crew ?? []).map(formatCrewName).filter(Boolean).join(', ');
  const contactId =
    typeof (params.eventPayload as any).contactId === 'string' ? (params.eventPayload as any).contactId : null;
  const appraisalId =
    typeof (params.eventPayload as any).appraisalId === 'string' ? (params.eventPayload as any).appraisalId : null;
  const listingId =
    typeof (params.eventPayload as any).listingId === 'string' ? (params.eventPayload as any).listingId : null;
  const reportId =
    typeof (params.eventPayload as any).reportId === 'string' ? (params.eventPayload as any).reportId : null;
  const reportToken =
    typeof (params.eventPayload as any).reportToken === 'string' ? (params.eventPayload as any).reportToken : null;

  const baseVariables: Record<string, any> = {
    org: {
      name: orgInfo.name,
      email: orgInfo.commFromEmail,
    },
    actor: {
      name: 'System',
      role: 'system',
      email: null,
    },
    recipient: {
      name: 'there',
      email: null,
      phone: null,
    },
      now: new Date().toISOString(),
      links: {
        appEntityUrl: buildAppLink({
          entityType: job ? 'job' : 'system',
          entityId: job?.id ?? params.runId,
          orgId: params.orgId,
          jobId: job?.id ?? null,
          contactId,
          appraisalId,
          listingId,
          reportId,
          reportToken,
        }),
        mapsUrl: address ? buildMapsLink(address) : null,
      },
    job: job
      ? {
          id: job.id,
          title: job.title,
          status: job.status,
          scheduledStart: job.scheduledStart?.toISOString?.() ?? null,
          scheduledEnd: job.scheduledEnd?.toISOString?.() ?? null,
          address,
          notesSummary: job.notes ?? null,
          completedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
        }
      : null,
    client: params.context.contacts.client
      ? {
          name: (params.context.contacts.client as any).name ?? null,
          email: (params.context.contacts.client as any).email ?? null,
          phone: (params.context.contacts.client as any).phone ?? null,
        }
      : null,
    clientContacts: params.context.contacts.client ? [params.context.contacts.client] : [],
    siteContacts: params.context.contacts.siteContacts ?? [],
    crew: (params.context.crew ?? []).map((member: any) => ({
      id: member.id,
      name: formatCrewName(member),
      role: member.role ?? null,
      phone: member.phone ?? null,
      email: member.email ?? null,
    })),
    crewSummary,
    materialsSummary: (params.eventPayload as any)?.materialsSummary ?? (params.eventPayload as any)?.materials ?? [],
    automation: {
      ruleName: params.ruleName,
      triggerKey: params.triggerKey,
      runId: params.runId,
    },
  };

  const variables = mergeDeep(baseVariables, params.eventPayload as Record<string, any>);

  const subjectResult = templateRow?.subject ? renderTemplate(templateRow.subject, variables) : null;
  const bodyResult = renderTemplate(templateRow.body, variables);
  const previewText = bodyResult.rendered.slice(0, 200);

  return {
    channel,
    to: action.to,
    templateKey: action.templateKey,
    subject: subjectResult?.rendered ?? null,
    previewText,
  };
}

async function executeCommAction(params: {
  db: DbClient;
  action: CommRuleAction;
  exec: RuleExecutionContext;
  stepId: string;
}): Promise<ActionResult> {
  const channel = params.action.type === 'comm.send_email' ? 'email' : params.action.type === 'comm.send_sms' ? 'sms' : 'in_app';
  const recipients = resolveRecipients(params.action.type, params.action.to, params.exec.context, params.action);

  const commEventId = await emitCommEvent({
    orgId: params.exec.orgId,
    eventKey: params.action.templateKey,
    entityType: 'automation_rule_step',
    entityId: params.stepId,
    triggeredByUserId: params.exec.event.actorUserId ?? null,
    source: 'automation_rule',
    payload: {
      ...params.exec.event.payload,
      jobId: (params.exec.event.payload as any)?.jobId ?? null,
      recipients,
      forceChannels: [channel],
      automation: {
        ruleId: params.exec.ruleId,
        ruleName: params.exec.ruleName,
        triggerKey: params.exec.triggerKey,
        runId: params.exec.runId,
        stepId: params.stepId,
      },
    },
    actorRoleKey: 'system',
  });

  if (!commEventId) {
    return { status: 'failed', error: 'Failed to emit communications event' };
  }

  const outboxRows: Array<{
    id: string;
    channel: string;
    subject: string | null;
    body: string | null;
    providerMessageId: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    recipientUserId: string | null;
  }> = await params.db
    .select({
      id: commOutbox.id,
      channel: commOutbox.channel,
      subject: commOutbox.subjectRendered,
      body: commOutbox.bodyRendered,
      providerMessageId: commOutbox.providerMessageId,
      recipientEmail: commOutbox.recipientEmail,
      recipientPhone: commOutbox.recipientPhone,
      recipientUserId: commOutbox.recipientUserId,
    })
    .from(commOutbox)
    .where(and(eq(commOutbox.orgId, params.exec.orgId), eq(commOutbox.eventId, commEventId)))
    .orderBy(asc(commOutbox.createdAt));

  const first = outboxRows[0];
  const previewText = first?.body ? String(first.body).slice(0, 200) : null;

  return {
    status: 'succeeded',
    result: {
      commEventId,
      outboxIds: outboxRows.map((row) => row.id),
      providerMessageIds: outboxRows.map((row) => row.providerMessageId).filter(Boolean),
      recipientCount: outboxRows.length,
    },
    commPreview: first
      ? {
          channel: first.channel,
          to: params.action.to,
          templateKey: params.action.templateKey,
          subject: first.subject ?? null,
          previewText,
        }
      : {
          channel,
          to: params.action.to,
          templateKey: params.action.templateKey,
          subject: null,
          previewText: null,
        },
  };
}

async function updateJobTags(params: {
  db: DbClient;
  orgId: string;
  jobId: string;
  tag?: string;
  flag?: string;
  auditContext: { actorUserId?: string | null };
}): Promise<ActionResult> {
  const [jobRow] = await params.db
    .select({ tags: jobs.tags, flags: jobs.flags })
    .from(jobs)
    .where(and(eq(jobs.orgId, params.orgId), eq(jobs.id, params.jobId)))
    .limit(1);

  if (!jobRow) return { status: 'failed', error: 'Job not found' };

  const existingTags = Array.isArray(jobRow.tags) ? (jobRow.tags as string[]) : [];
  const existingFlags = Array.isArray(jobRow.flags) ? (jobRow.flags as string[]) : [];

  const nextTags = params.tag ? Array.from(new Set([...existingTags, params.tag])) : existingTags;
  const nextFlags = params.flag ? Array.from(new Set([...existingFlags, params.flag])) : existingFlags;

  const [updated] = await params.db
    .update(jobs)
    .set({ tags: nextTags, flags: nextFlags, updatedAt: new Date() })
    .where(and(eq(jobs.orgId, params.orgId), eq(jobs.id, params.jobId)))
    .returning({ id: jobs.id });

  if (!updated) return { status: 'failed', error: 'Failed to update job tags/flags' };

  void logAuditEvent({
    orgId: params.orgId,
    actorUserId: params.auditContext.actorUserId ?? null,
    actorType: 'user',
    action: 'UPDATE',
    entityType: 'job',
    entityId: params.jobId,
    before: { tags: existingTags, flags: existingFlags },
    after: { tags: nextTags, flags: nextFlags },
    metadata: null,
  });

  return {
    status: 'succeeded',
    result: {
      jobId: params.jobId,
      tags: nextTags,
      flags: nextFlags,
    },
  };
}

async function createChecklistTasks(params: {
  db: DbClient;
  orgId: string;
  jobId: string;
  checklistKey: string;
}): Promise<ActionResult> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.checklistKey);

  const [template] = await params.db
    .select({ id: workTemplates.id })
    .from(workTemplates)
    .where(
      and(
        eq(workTemplates.orgId, params.orgId),
        isUuid ? eq(workTemplates.id, params.checklistKey) : eq(workTemplates.name, params.checklistKey)
      )
    )
    .limit(1);

  if (!template) {
    return { status: 'failed', error: 'Checklist template not found' };
  }

  const steps: Array<{
    id: string;
    title: string;
    description: string | null;
    isRequired: boolean | null;
    sortOrder: number | null;
  }> = await params.db
    .select({ id: workTemplateSteps.id, title: workTemplateSteps.title, description: workTemplateSteps.description, isRequired: workTemplateSteps.isRequired, sortOrder: workTemplateSteps.sortOrder })
    .from(workTemplateSteps)
    .where(and(eq(workTemplateSteps.orgId, params.orgId), eq(workTemplateSteps.templateId, template.id)))
    .orderBy(asc(workTemplateSteps.sortOrder));

  if (steps.length === 0) {
    return { status: 'failed', error: 'Checklist template has no steps' };
  }

  const [orderRow] = await params.db
    .select({ maxOrder: sql<number>`max(${tasks.order})`.mapWith(Number) })
    .from(tasks)
    .where(and(eq(tasks.orgId, params.orgId), eq(tasks.jobId, params.jobId)));

  const baseOrder = Number(orderRow?.maxOrder ?? 0);
  const now = new Date();

  const taskRows = steps.map((step, index) => ({
    orgId: params.orgId,
    jobId: params.jobId,
    title: step.title,
    description: step.description ?? null,
    status: 'pending',
    order: baseOrder + index + 1,
    isRequired: step.isRequired ?? true,
    createdAt: now,
    updatedAt: now,
  }));

  const inserted = await params.db.insert(tasks).values(taskRows).returning({ id: tasks.id });

  return {
    status: 'succeeded',
    result: { createdTaskIds: inserted.map((row: any) => row.id) },
  };
}

async function createDraftInvoice(params: { db: DbClient; orgId: string; jobId: string; runId: string }): Promise<ActionResult> {
  const now = new Date();
  const [invoice] = await params.db
    .insert(jobInvoices)
    .values({
      orgId: params.orgId,
      jobId: params.jobId,
      provider: 'manual',
      amountCents: 0,
      currency: 'AUD',
      status: 'draft',
      idempotencyKey: `${params.runId}:draft`,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: jobInvoices.id });

  if (!invoice) {
    return { status: 'failed', error: 'Failed to create draft invoice' };
  }

  return {
    status: 'succeeded',
    result: { invoiceId: invoice.id },
  };
}

export async function executeRuleActions(params: {
  db: DbClient;
  exec: RuleExecutionContext;
  actions: RuleAction[];
  auditContext: { actorUserId?: string | null };
}): Promise<{ ok: boolean; error?: string | null; errorDetails?: Record<string, unknown> | null }> {
  for (let index = 0; index < params.actions.length; index += 1) {
    const action = params.actions[index];

    const [stepRow] = await params.db
      .insert(automationRuleRunSteps)
      .values({
        runId: params.exec.runId,
        stepIndex: index,
        actionType: action.type,
        actionInput: action as any,
        status: 'pending',
      })
      .returning({ id: automationRuleRunSteps.id });

    const stepId = stepRow?.id ?? null;
    if (!stepId) {
      return { ok: false, error: 'Failed to create run step' };
    }

    await params.db
      .update(automationRuleRunSteps)
      .set({ status: 'running' })
      .where(eq(automationRuleRunSteps.id, stepId));

    let outcome: ActionResult = { status: 'failed', error: 'Unsupported action' };

    try {
      if (isCommRuleAction(action)) {
        outcome = await executeCommAction({ db: params.db, action, exec: params.exec, stepId });
      } else if (action.type === 'job.add_tag') {
        const jobId = typeof params.exec.event.payload.jobId === 'string' ? params.exec.event.payload.jobId : null;
        if (!jobId) {
          outcome = { status: 'failed', error: 'Job ID is required for tag updates' };
        } else {
          outcome = await updateJobTags({
            db: params.db,
            orgId: params.exec.orgId,
            jobId,
            tag: action.tag,
            auditContext: params.auditContext,
          });
        }
      } else if (action.type === 'job.add_flag') {
        const jobId = typeof params.exec.event.payload.jobId === 'string' ? params.exec.event.payload.jobId : null;
        if (!jobId) {
          outcome = { status: 'failed', error: 'Job ID is required for flag updates' };
        } else {
          outcome = await updateJobTags({
            db: params.db,
            orgId: params.exec.orgId,
            jobId,
            flag: action.flag,
            auditContext: params.auditContext,
          });
        }
      } else if (action.type === 'tasks.create_checklist') {
        const jobId = typeof params.exec.event.payload.jobId === 'string' ? params.exec.event.payload.jobId : null;
        if (!jobId) {
          outcome = { status: 'failed', error: 'Job ID is required for checklist tasks' };
        } else {
          outcome = await createChecklistTasks({
            db: params.db,
            orgId: params.exec.orgId,
            jobId,
            checklistKey: action.checklistKey,
          });
        }
      } else if (action.type === 'invoice.create_draft') {
        const jobId = typeof params.exec.event.payload.jobId === 'string' ? params.exec.event.payload.jobId : null;
        if (!jobId) {
          outcome = { status: 'failed', error: 'Job ID is required for invoice drafts' };
        } else {
          outcome = await createDraftInvoice({
            db: params.db,
            orgId: params.exec.orgId,
            jobId,
            runId: params.exec.runId,
          });
        }
      } else if (action.type === 'reminder.create_internal') {
        outcome = {
          status: 'succeeded',
          result: {
            stubbed: true,
            reason: 'reminders_not_implemented',
            minutesFromNow: action.minutesFromNow,
          },
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      outcome = {
        status: 'failed',
        error: message,
        errorDetails:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      };
    }

    const errorDetails =
      outcome.status === 'succeeded'
        ? outcome.errorDetails ?? null
        : { ...(outcome.errorDetails ?? {}), stepIndex: index, actionType: action.type };

    await params.db
      .update(automationRuleRunSteps)
      .set({
        status: outcome.status,
        result: outcome.result ?? null,
        commPreview: outcome.commPreview ?? null,
        error: outcome.error ?? null,
        errorDetails,
      })
      .where(eq(automationRuleRunSteps.id, stepId));

    if (outcome.status !== 'succeeded') {
      return { ok: false, error: outcome.error ?? 'Action failed', errorDetails };
    }
  }

  return { ok: true };
}

export async function buildActionPreviews(params: {
  db: DbClient;
  orgId: string;
  ruleName: string;
  triggerKey: TriggerKey;
  runId: string;
  actions: RuleAction[];
  context: AutomationContext;
  eventPayload: Record<string, unknown>;
}): Promise<Array<Record<string, unknown>>> {
  const previews: Array<Record<string, unknown>> = [];

  for (const action of params.actions) {
    if (!isCommRuleAction(action)) continue;
    const preview = await buildCommPreview({
      db: params.db,
      orgId: params.orgId,
      action,
      context: params.context,
      eventPayload: params.eventPayload,
      ruleName: params.ruleName,
      triggerKey: params.triggerKey,
      runId: params.runId,
    });
    if (preview) previews.push(preview);
  }

  return previews;
}
