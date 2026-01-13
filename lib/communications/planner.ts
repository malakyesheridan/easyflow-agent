import { and, desc, eq, inArray } from 'drizzle-orm';
import { commPreferences } from '@/db/schema/comm_preferences';
import { commTemplates } from '@/db/schema/comm_templates';
import { commOutbox } from '@/db/schema/comm_outbox';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { users } from '@/db/schema/users';
import { orgMemberships } from '@/db/schema/org_memberships';
import { orgRoles } from '@/db/schema/org_roles';
import { crewMembers } from '@/db/schema/crew_members';
import { jobs } from '@/db/schema/jobs';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import { jobContacts } from '@/db/schema/job_contacts';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobPayments } from '@/db/schema/job_payments';
import { announcements } from '@/db/schema/announcements';
import { assignmentToDateRange } from '@/lib/utils/scheduleTime';
import { renderEmailHtml, renderTemplate } from '@/lib/communications/renderer';
import { seedCommDefaults } from '@/lib/communications/seed';
import type { CommChannel, CommRecipientType, CommDeliveryMode, RecipientRules, TimingRules } from '@/lib/communications/types';
import { isValidEmail, parseAdditionalEmails, resolveSenderIdentity } from '@/lib/communications/sender';
import { createHash } from 'crypto';

type DbClient = {
  select: any;
  insert: any;
  update: any;
  execute: any;
};

type Recipient = {
  type: CommRecipientType;
  userId?: string | null;
  crewMemberId?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  roleKey?: string | null;
};

type ResolvedRecipientRules = {
  sendToAdmins: boolean;
  sendToAssignedCrew: boolean;
  sendToClientContacts: boolean;
  sendToSiteContacts: boolean;
  sendToAllStaff: boolean;
  additionalEmails: string[];
  toSpecificUserIds: string[];
};

type CommEventRow = {
  id: string;
  orgId: string;
  eventKey: string;
  entityType: string;
  entityId: string;
  triggeredByUserId?: string | null;
  payload?: Record<string, unknown> | null;
};

type TemplateRow = {
  id: string;
  key: string;
  channel: string;
  subject: string | null;
  body: string;
  bodyHtml: string | null;
  version: number;
  isEnabled: boolean;
};

const EMAIL_CHANNEL: CommChannel = 'email';
const SMS_CHANNEL: CommChannel = 'sms';
const IN_APP_CHANNEL: CommChannel = 'in_app';

function normalizeRecipientRules(rules: unknown): RecipientRules {
  if (!rules || typeof rules !== 'object') return {};
  return rules as RecipientRules;
}

function normalizeTimingRules(rules: unknown): TimingRules {
  if (!rules || typeof rules !== 'object') return {};
  return rules as TimingRules;
}

function resolvePreferenceRules(preference: any): ResolvedRecipientRules {
  const rules = normalizeRecipientRules(preference?.recipientRules);
  const roles = Array.isArray(rules.to_roles) ? rules.to_roles : [];
  const roleSet = new Set(roles.map((role) => String(role).toLowerCase()));
  const additionalFromRules = Array.isArray(rules.additional_emails) ? rules.additional_emails : [];

  const additionalEmails = [
    ...parseAdditionalEmails(preference?.additionalEmails ?? null),
    ...additionalFromRules.filter((value) => isValidEmail(value)),
  ];

  return {
    sendToAdmins: preference?.sendToAdmins ?? (roleSet.has('admin') || roleSet.has('manager')),
    sendToAssignedCrew: preference?.sendToAssignedCrew ?? Boolean(rules.to_assigned_staff),
    sendToClientContacts: preference?.sendToClientContacts ?? Boolean(rules.to_client),
    sendToSiteContacts: preference?.sendToSiteContacts ?? Boolean(rules.to_site_contacts),
    sendToAllStaff: Boolean(rules.to_all_staff),
    additionalEmails: Array.from(new Set(additionalEmails.map((value) => value.toLowerCase()))),
    toSpecificUserIds: Array.isArray(rules.to_specific_user_ids) ? rules.to_specific_user_ids : [],
  };
}

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

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

function buildAppLink(params: { entityType: string; entityId: string; orgId: string; jobId?: string | null }): string {
  const baseUrl = getBaseUrl();
  const orgQuery = `?orgId=${params.orgId}`;
  if (params.entityType === 'announcement') {
    return `${baseUrl}/announcements${orgQuery}`;
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

function getIdempotencyKey(params: {
  orgId: string;
  eventKey: string;
  entityId: string;
  channel: CommChannel;
  recipientKey: string;
  templateVersion: number;
}): string {
  const raw = `${params.orgId}:${params.eventKey}:${params.entityId}:${params.channel}:${params.recipientKey}:${params.templateVersion}`;
  return createHash('sha256').update(raw).digest('hex');
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

async function loadOrgContext(db: DbClient, orgId: string) {
  const [row] = await db
    .select({
      orgName: orgs.name,
      orgId: orgs.id,
      commFromName: orgSettings.commFromName,
      commFromEmail: orgSettings.commFromEmail,
      commReplyToEmail: orgSettings.commReplyToEmail,
    })
    .from(orgs)
    .leftJoin(orgSettings, eq(orgSettings.orgId, orgs.id))
    .where(eq(orgs.id, orgId))
    .limit(1);

  return {
    org: {
      id: row?.orgId ?? orgId,
      name: row?.orgName ?? 'Organisation',
      email: row?.commFromEmail ?? null,
    },
    commFromName: row?.commFromName ?? null,
    commFromEmail: row?.commFromEmail ?? null,
    commReplyToEmail: row?.commReplyToEmail ?? null,
  };
}

async function loadActorContext(db: DbClient, orgId: string, userId?: string | null) {
  if (!userId) {
    return { actor: { name: 'System', role: 'system', email: null } };
  }

  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      roleKey: orgRoles.key,
    })
    .from(users)
    .innerJoin(orgMemberships, eq(orgMemberships.userId, users.id))
    .leftJoin(orgRoles, eq(orgMemberships.roleId, orgRoles.id))
    .where(and(eq(users.id, userId), eq(orgMemberships.orgId, orgId)))
    .limit(1);

  return {
    actor: {
      name: row?.name ?? row?.email ?? 'User',
      role: row?.roleKey ?? null,
      email: row?.email ?? null,
    },
  };
}

async function loadOrgUsers(db: DbClient, orgId: string): Promise<Recipient[]> {
  const rows = await db
    .select({
      userId: orgMemberships.userId,
      crewMemberId: orgMemberships.crewMemberId,
      roleKey: orgRoles.key,
      userName: users.name,
      userEmail: users.email,
      crewName: crewMembers.displayName,
      crewEmail: crewMembers.email,
      crewPhone: crewMembers.phone,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .leftJoin(orgRoles, eq(orgMemberships.roleId, orgRoles.id))
    .leftJoin(crewMembers, eq(orgMemberships.crewMemberId, crewMembers.id))
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.status, 'active')));

  return rows.map((row: any) => ({
    type: 'user' as const,
    userId: row.userId,
    crewMemberId: row.crewMemberId ?? null,
    roleKey: row.roleKey ?? null,
    name: row.userName ?? row.crewName ?? row.userEmail ?? null,
    email: row.userEmail ?? row.crewEmail ?? null,
    phone: row.crewPhone ?? null,
  }));
}

async function loadJobContext(db: DbClient, orgId: string, jobId: string, assignmentId?: string | null) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)))
    .limit(1);

  if (!job) return { job: null, assignments: [], crew: [], client: null };

  const assignments = await db
    .select()
    .from(scheduleAssignments)
    .where(and(eq(scheduleAssignments.orgId, orgId), eq(scheduleAssignments.jobId, jobId)));

  const crewIds = Array.from(
    new Set<string>(assignments.map((row: any) => row.crewId).filter((id: any): id is string => typeof id === 'string'))
  );
  if (crewIds.length === 0 && typeof job.crewId === 'string') {
    crewIds.push(job.crewId);
  }
  const crew =
    crewIds.length > 0
      ? await db
          .select()
          .from(crewMembers)
          .where(and(eq(crewMembers.orgId, orgId), inArray(crewMembers.id, crewIds)))
      : [];

  const contacts = await db
    .select()
    .from(jobContacts)
    .where(and(eq(jobContacts.orgId, orgId), eq(jobContacts.jobId, jobId)));

  const clientContacts = contacts.filter((contact: any) => {
    const role = String(contact.role ?? '').toLowerCase();
    return role === 'client';
  });
  const siteContacts = contacts.filter((contact: any) => {
    const role = String(contact.role ?? '').toLowerCase();
    return role.includes('site');
  });
  const clientContact = clientContacts[0] || contacts[0] || null;

  const assignment = assignmentId ? assignments.find((a: any) => a.id === assignmentId) : assignments[0] ?? null;
  const schedule = assignment
    ? assignmentToDateRange(new Date(assignment.date), assignment.startMinutes, assignment.endMinutes)
    : job.scheduledStart && job.scheduledEnd
      ? { scheduledStart: new Date(job.scheduledStart), scheduledEnd: new Date(job.scheduledEnd) }
      : null;

  const address = formatAddress(job);
  const crewSummary = crew.map(formatCrewName).filter(Boolean).join(', ');

  return {
    job,
    schedule,
    crew,
    crewSummary,
    client: clientContact,
    clientContacts,
    siteContacts,
    address,
  };
}

async function loadAnnouncementContext(db: DbClient, orgId: string, announcementId: string) {
  const [row] = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.orgId, orgId), eq(announcements.id, announcementId)))
    .limit(1);

  return row ?? null;
}

async function loadInvoiceContext(db: DbClient, orgId: string, invoiceId?: string | null, jobId?: string | null) {
  let row = null;
  if (invoiceId) {
    [row] = await db
      .select()
      .from(jobInvoices)
      .where(and(eq(jobInvoices.orgId, orgId), eq(jobInvoices.id, invoiceId)))
      .limit(1);
  }

  if (!row && jobId) {
    [row] = await db
      .select()
      .from(jobInvoices)
      .where(and(eq(jobInvoices.orgId, orgId), eq(jobInvoices.jobId, jobId)))
      .orderBy(desc(jobInvoices.createdAt))
      .limit(1);
  }

  return row;
}

async function loadPaymentContext(db: DbClient, orgId: string, paymentId?: string | null, jobId?: string | null) {
  let row = null;
  if (paymentId) {
    [row] = await db
      .select()
      .from(jobPayments)
      .where(and(eq(jobPayments.orgId, orgId), eq(jobPayments.id, paymentId)))
      .limit(1);
  }

  if (!row && jobId) {
    [row] = await db
      .select()
      .from(jobPayments)
      .where(and(eq(jobPayments.orgId, orgId), eq(jobPayments.jobId, jobId)))
      .orderBy(desc(jobPayments.createdAt))
      .limit(1);
  }

  return row;
}

async function resolveRecipients(db: DbClient, params: {
  orgId: string;
  event: CommEventRow;
  rules: ResolvedRecipientRules;
  jobContext: Awaited<ReturnType<typeof loadJobContext>> | null;
  deliveryMode: CommDeliveryMode | null;
}) {
  const recipients: Recipient[] = [];
  const orgUsers = await loadOrgUsers(db, params.orgId);

  if (params.rules.sendToAllStaff) {
    recipients.push(...orgUsers);
  }

  if (params.rules.sendToAdmins) {
    recipients.push(
      ...orgUsers.filter((user) => {
        const roleKey = user.roleKey ? user.roleKey.toLowerCase() : '';
        return roleKey === 'admin' || roleKey === 'manager';
      })
    );
  }

  if (params.rules.toSpecificUserIds.length > 0) {
    const targetIds = new Set(params.rules.toSpecificUserIds);
    recipients.push(...orgUsers.filter((user) => user.userId && targetIds.has(user.userId)));
  }

  if (params.rules.sendToAssignedCrew && params.deliveryMode !== 'digest' && params.jobContext?.crew?.length) {
    const crewIds = new Set(params.jobContext.crew.map((c: any) => c.id));
    recipients.push(...orgUsers.filter((user) => user.crewMemberId && crewIds.has(user.crewMemberId)));
  }

  if (params.rules.sendToClientContacts && params.jobContext?.clientContacts?.length) {
    for (const contact of params.jobContext.clientContacts) {
      recipients.push({
        type: 'client',
        userId: null,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        name: contact.name ?? null,
        roleKey: null,
      });
    }
  }

  if (params.rules.sendToSiteContacts && params.jobContext?.siteContacts?.length) {
    for (const contact of params.jobContext.siteContacts) {
      recipients.push({
        type: 'custom',
        userId: null,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        name: contact.name ?? null,
        roleKey: null,
      });
    }
  }

  for (const email of params.rules.additionalEmails) {
    recipients.push({
      type: 'custom',
      userId: null,
      email,
      phone: null,
      name: email,
      roleKey: null,
    });
  }

  const byKey = new Map<string, Recipient>();
  for (const recipient of recipients) {
    const email = recipient.email ? recipient.email.trim() : null;
    const phone = recipient.phone ? recipient.phone.trim() : null;
    const normalized: Recipient = {
      ...recipient,
      email: email && isValidEmail(email) ? email : null,
      phone: phone || null,
    };
    const key = normalized.userId
      ? `user:${normalized.userId}`
      : `contact:${normalized.email ?? normalized.phone ?? normalized.name ?? ''}`;
    if (!byKey.has(key)) {
      byKey.set(key, normalized);
    }
  }

  return Array.from(byKey.values());
}

function recipientsFromPayload(payload: Record<string, unknown> | null | undefined): Recipient[] {
  const raw = (payload as any)?.recipients;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item: any) => ({
      type: (item.type as CommRecipientType) ?? (item.userId ? 'user' : 'custom'),
      userId: item.userId ?? null,
      email: item.email ?? null,
      phone: item.phone ?? null,
      name: item.name ?? null,
      roleKey: item.roleKey ?? null,
      crewMemberId: item.crewMemberId ?? null,
    }));
}

async function loadLatestTemplate(db: DbClient, orgId: string, eventKey: string, channel: CommChannel): Promise<TemplateRow | null> {
  const [row] = await db
    .select({
      id: commTemplates.id,
      key: commTemplates.key,
      channel: commTemplates.channel,
      subject: commTemplates.subject,
      body: commTemplates.body,
      bodyHtml: commTemplates.bodyHtml,
      version: commTemplates.version,
      isEnabled: commTemplates.isEnabled,
    })
    .from(commTemplates)
    .where(and(eq(commTemplates.orgId, orgId), eq(commTemplates.key, eventKey), eq(commTemplates.channel, channel)))
    .orderBy(desc(commTemplates.version))
    .limit(1);

  return row ?? null;
}

export async function planCommMessages(params: {
  db: DbClient;
  event: CommEventRow;
}): Promise<void> {
  const event = params.event;
  const db = params.db;
  const payload = (event.payload ?? {}) as Record<string, any>;

  await seedCommDefaults(db, event.orgId);

  const [preference] = await db
    .select()
    .from(commPreferences)
    .where(and(eq(commPreferences.orgId, event.orgId), eq(commPreferences.eventKey, event.eventKey)))
    .limit(1);

  if (!preference) return;

  const preferenceEnabled = preference.enabled ?? true;
  const rules = resolvePreferenceRules(preference);
  const timing = normalizeTimingRules(preference.timing);
  const deliveryMode: CommDeliveryMode | null = preference.deliveryMode === 'digest' ? 'digest' : 'instant';

  const jobId = event.entityType === 'job' ? event.entityId : payload?.jobId ?? null;
  const assignmentId = payload?.assignmentId ?? null;
  const jobContext = jobId ? await loadJobContext(db, event.orgId, jobId, assignmentId) : null;

  const { org, commFromName, commFromEmail, commReplyToEmail } = await loadOrgContext(db, event.orgId);
  const senderIdentity = resolveSenderIdentity({
    orgName: org.name,
    commFromName,
    commFromEmail,
    commReplyToEmail,
  });
  const actorContext = await loadActorContext(db, event.orgId, event.triggeredByUserId ?? null);

  const payloadRecipientOverrides = recipientsFromPayload(payload);
  const recipients =
    payloadRecipientOverrides.length > 0
      ? payloadRecipientOverrides
      : await resolveRecipients(db, {
          orgId: event.orgId,
          event,
          rules,
          jobContext,
          deliveryMode,
        });

  const forcedChannelsRaw = Array.isArray(payload.forceChannels) ? payload.forceChannels : null;
  const forcedChannels = forcedChannelsRaw
    ? forcedChannelsRaw
        .map((channel) => String(channel))
        .filter((channel): channel is CommChannel => channel === 'email' || channel === 'sms' || channel === 'in_app')
    : null;

  const channels: CommChannel[] = [];
  if (forcedChannels && forcedChannels.length > 0) {
    for (const channel of forcedChannels) channels.push(channel);
  } else {
    if (!preferenceEnabled) return;
    if (preference.enabledEmail) channels.push(EMAIL_CHANNEL);
    if (preference.enabledSms) channels.push(SMS_CHANNEL);
    if (preference.enabledInApp) channels.push(IN_APP_CHANNEL);
  }

  if (channels.length === 0) return;

  const templates = new Map<CommChannel, TemplateRow | null>();
  for (const channel of channels) {
    templates.set(channel, await loadLatestTemplate(db, event.orgId, event.eventKey, channel));
  }

  const announcementId = event.entityType === 'announcement' ? event.entityId : (payload as any)?.announcementId ?? null;
  const announcement = announcementId ? await loadAnnouncementContext(db, event.orgId, announcementId) : null;

  const invoice = await loadInvoiceContext(
    db,
    event.orgId,
    event.entityType === 'invoice' ? event.entityId : (payload as any)?.invoiceId ?? null,
    jobId
  );

  const payment = await loadPaymentContext(
    db,
    event.orgId,
    event.entityType === 'payment' ? event.entityId : (payload as any)?.paymentId ?? null,
    jobId
  );

  const links = {
    appEntityUrl: buildAppLink({ entityType: event.entityType, entityId: event.entityId, orgId: event.orgId, jobId }),
    mapsUrl: jobContext?.address ? buildMapsLink(jobContext.address) : null,
  };

  const baseVariables = mergeDeep(
    {
      org: {
        ...org,
        email: senderIdentity.fromEmail ?? org.email,
      },
      actor: actorContext.actor,
      now: new Date().toISOString(),
      links,
      job: jobContext?.job
        ? {
            id: jobContext.job.id,
            title: jobContext.job.title,
            status: jobContext.job.status,
            scheduledStart: jobContext.schedule?.scheduledStart?.toISOString?.() ?? null,
            scheduledEnd: jobContext.schedule?.scheduledEnd?.toISOString?.() ?? null,
            address: jobContext.address ?? null,
            notesSummary: jobContext.job.notes ?? null,
            completedAt: jobContext.job.updatedAt ? new Date(jobContext.job.updatedAt).toISOString() : null,
          }
        : null,
      client: jobContext?.client
        ? {
            name: jobContext.client.name ?? null,
            email: jobContext.client.email ?? null,
            phone: jobContext.client.phone ?? null,
          }
        : null,
      clientContacts: jobContext?.clientContacts ?? [],
      siteContacts: jobContext?.siteContacts ?? [],
      crew: jobContext?.crew?.map((member: any) => ({
        id: member.id,
        name: formatCrewName(member),
        role: member.role ?? null,
        phone: member.phone ?? null,
        email: member.email ?? null,
      })) ?? [],
      crewSummary: jobContext?.crewSummary ?? null,
      materialsSummary: (payload as any)?.materialsSummary ?? (payload as any)?.materials ?? [],
      invoice: invoice
        ? {
            id: invoice.id,
            number:
              invoice.invoiceNumber ??
              invoice.externalRef ??
              invoice.xeroInvoiceId ??
              invoice.id.slice(0, 8),
            total: formatCurrency(invoice.totalCents ?? invoice.amountCents, invoice.currency),
            dueDate: invoice.dueAt?.toISOString?.() ?? invoice.issuedAt?.toISOString?.() ?? invoice.sentAt?.toISOString?.() ?? null,
            status: invoice.status,
            pdfUrl: invoice.pdfUrl ?? null,
            paymentUrl: payment?.paymentLinkUrl ?? null,
            paidAt: invoice.paidAt?.toISOString?.() ?? null,
          }
        : null,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            amount: formatCurrency(payment.amountCents, payment.currency),
            paymentUrl: payment.paymentLinkUrl ?? null,
            method: payment.method ?? null,
            reference: payment.reference ?? null,
          }
        : null,
      announcement: announcement
        ? {
            title: announcement.title,
            body: announcement.message,
            urgent: announcement.priority === 'urgent',
            publishedAt: announcement.createdAt?.toISOString?.() ?? null,
          }
        : null,
      integration: (payload as any)?.integration ?? null,
    } as Record<string, any>,
    payload
  );

  const now = new Date();
  let scheduledFor: Date | null = null;
  if (timing.scheduled_at) {
    const parsed = new Date(timing.scheduled_at);
    if (!Number.isNaN(parsed.getTime())) scheduledFor = parsed;
  } else if (timing.delay_minutes !== undefined) {
    const minutes = Number(timing.delay_minutes);
    if (Number.isFinite(minutes)) scheduledFor = new Date(now.getTime() + minutes * 60 * 1000);
  } else if (timing.delay_hours !== undefined) {
    const hours = Number(timing.delay_hours);
    if (Number.isFinite(hours)) scheduledFor = new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  const outboxRows: any[] = [];

  if (recipients.length === 0) {
    const skipChannel = channels[0] ?? EMAIL_CHANNEL;
    const idempotencyKey = getIdempotencyKey({
      orgId: event.orgId,
      eventKey: event.eventKey,
      entityId: event.entityId,
      channel: skipChannel,
      recipientKey: 'none',
      templateVersion: 0,
    });

    outboxRows.push({
      orgId: event.orgId,
      eventId: event.id,
      eventKey: event.eventKey,
      entityType: event.entityType,
      entityId: event.entityId,
      channel: skipChannel,
      recipientType: 'custom',
      recipientUserId: null,
      recipientEmail: null,
      recipientPhone: null,
      templateId: null,
      templateVersion: 0,
      subjectRendered: null,
      bodyRendered: 'No recipients resolved',
      bodyHtmlRendered: null,
      status: 'suppressed',
      provider: skipChannel === EMAIL_CHANNEL ? 'resend' : skipChannel === SMS_CHANNEL ? 'stub' : 'in_app',
      error: 'no_recipients',
      fromName: senderIdentity.fromName,
      fromEmail: senderIdentity.fromEmail,
      replyToEmail: senderIdentity.replyTo,
      metadata: {
        skipReason: 'no_recipients',
        eventPayload: payload,
        commFromEmail: commFromEmail,
        commReplyToEmail: commReplyToEmail,
      },
      idempotencyKey,
      scheduledFor,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (recipients.length === 0) {
    await db
      .insert(commOutbox)
      .values(outboxRows)
      .onConflictDoNothing({ target: [commOutbox.orgId, commOutbox.idempotencyKey] });
    return;
  }

  for (const channel of channels) {
    const template = templates.get(channel) ?? null;
    for (const recipient of recipients) {
      const recipientEmail = recipient.email ?? null;
      const recipientPhone = recipient.phone ?? null;
      if (channel === EMAIL_CHANNEL && (!recipientEmail || !isValidEmail(recipientEmail))) continue;
      if (channel === SMS_CHANNEL && !recipientPhone) continue;
      if (channel === IN_APP_CHANNEL && !recipient.userId) continue;
      const recipientKey = recipient.userId ?? recipientEmail ?? recipientPhone ?? recipient.name ?? 'unknown';
      const templateVersion = template?.version ?? 0;

      const idempotencyKey = getIdempotencyKey({
        orgId: event.orgId,
        eventKey: event.eventKey,
        entityId: event.entityId,
        channel,
        recipientKey,
        templateVersion,
      });

      if (!template || !template.isEnabled) {
        outboxRows.push({
          orgId: event.orgId,
          eventId: event.id,
          eventKey: event.eventKey,
          entityType: event.entityType,
          entityId: event.entityId,
          channel,
          recipientType: recipient.type,
          recipientUserId: recipient.userId ?? null,
          recipientEmail,
          recipientPhone,
          templateId: null,
          templateVersion,
          subjectRendered: null,
          bodyRendered: 'Template unavailable',
          bodyHtmlRendered: null,
          status: 'suppressed',
          provider: channel === EMAIL_CHANNEL ? 'resend' : channel === SMS_CHANNEL ? 'stub' : 'in_app',
          error: 'template_missing',
          fromName: senderIdentity.fromName,
          fromEmail: senderIdentity.fromEmail,
          replyToEmail: senderIdentity.replyTo,
          metadata: {
            missingTemplate: true,
            variables: baseVariables,
            eventPayload: payload,
          },
          idempotencyKey,
          scheduledFor,
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }

      if (channel === EMAIL_CHANNEL && !senderIdentity.fromEmail) {
        outboxRows.push({
          orgId: event.orgId,
          eventId: event.id,
          eventKey: event.eventKey,
          entityType: event.entityType,
          entityId: event.entityId,
          channel,
          recipientType: recipient.type,
          recipientUserId: recipient.userId ?? null,
          recipientEmail,
          recipientPhone,
          templateId: template.id,
          templateVersion: template.version,
          subjectRendered: null,
          bodyRendered: 'Sender identity is not configured',
          bodyHtmlRendered: null,
          status: 'suppressed',
          provider: 'resend',
          error: 'from_email_missing',
          fromName: senderIdentity.fromName,
          fromEmail: senderIdentity.fromEmail,
          replyToEmail: senderIdentity.replyTo,
          metadata: {
            skipReason: 'from_email_missing',
            eventPayload: payload,
          },
          idempotencyKey,
          scheduledFor,
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }

      const recipientVariables = mergeDeep(
        { ...baseVariables },
        {
          recipient: {
            name: recipient.name ?? recipient.email ?? 'there',
            email: recipient.email ?? null,
            phone: recipient.phone ?? null,
          },
        }
      );

      const subjectResult = template.subject ? renderTemplate(template.subject, recipientVariables) : null;
      const bodyTextResult = renderTemplate(template.body, recipientVariables);
      const htmlResult = template.bodyHtml
        ? renderTemplate(template.bodyHtml, recipientVariables)
        : { rendered: renderEmailHtml(bodyTextResult.rendered), missing: [] as string[] };

      outboxRows.push({
        orgId: event.orgId,
        eventId: event.id,
        eventKey: event.eventKey,
        entityType: event.entityType,
        entityId: event.entityId,
        channel,
        recipientType: recipient.type,
        recipientUserId: recipient.userId ?? null,
        recipientEmail,
        recipientPhone,
        templateId: template.id,
        templateVersion: template.version,
        subjectRendered: subjectResult?.rendered ?? null,
        bodyRendered: bodyTextResult.rendered,
        bodyHtmlRendered: channel === EMAIL_CHANNEL ? htmlResult.rendered : null,
        status: 'queued',
        provider: channel === EMAIL_CHANNEL ? 'resend' : channel === SMS_CHANNEL ? 'stub' : 'in_app',
        error: null,
        fromName: senderIdentity.fromName,
        fromEmail: senderIdentity.fromEmail,
        replyToEmail: senderIdentity.replyTo,
        metadata: {
          variables: recipientVariables,
          missingVars: Array.from(
            new Set([...(subjectResult?.missing ?? []), ...bodyTextResult.missing, ...htmlResult.missing])
          ),
          recipients: channel === EMAIL_CHANNEL ? { to: [recipientEmail], cc: [], bcc: [] } : null,
          eventPayload: payload,
          commFromEmail,
          commReplyToEmail,
          createdByUserId: event.triggeredByUserId ?? null,
          deliveryMode,
        },
        idempotencyKey,
        scheduledFor,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (outboxRows.length === 0) return;

  await db
    .insert(commOutbox)
    .values(outboxRows)
    .onConflictDoNothing({ target: [commOutbox.orgId, commOutbox.idempotencyKey] });
}
