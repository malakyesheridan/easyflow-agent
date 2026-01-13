import { and, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import { jobs } from '@/db/schema/jobs';
import { crewMembers } from '@/db/schema/crew_members';
import { orgMemberships } from '@/db/schema/org_memberships';
import { users } from '@/db/schema/users';
import { orgSettings } from '@/db/schema/org_settings';
import { orgs } from '@/db/schema/orgs';
import { jobContacts } from '@/db/schema/job_contacts';
import { tasks } from '@/db/schema/tasks';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { commOutbox } from '@/db/schema/comm_outbox';
import { commTemplates } from '@/db/schema/comm_templates';
import { assignmentToDateRange } from '@/lib/utils/scheduleTime';
import { emitCommEvent } from '@/lib/communications/emit';
import { getDb } from '@/lib/db';
import { toNumber } from '@/lib/utils/quantity';
import { createHash } from 'crypto';

type AssignmentRow = {
  assignmentId: string;
  crewId: string | null;
  date: Date;
  startMinutes: number;
  endMinutes: number;
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  jobPriority: string;
  addressLine1: string;
  addressLine2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  notes: string | null;
};

type TaskSummaryRow = {
  jobId: string;
  requiredTotal: number;
  requiredCompleted: number;
};

type MaterialSummaryRow = {
  jobId: string;
  plannedCount: number;
  plannedQuantity: number;
  loggedCount: number;
  loggedQuantity: number;
};

type ContactRow = {
  jobId: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
};

type CrewRecipient = {
  crewId: string;
  crewName: string;
  email: string | null;
  userId: string | null;
};

type JobCard = {
  id: string;
  title: string;
  status: string;
  priority: string;
  timeWindow: string;
  address: string;
  notesSummary: string | null;
  routeUrl: string | null;
  contact: ContactRow | null;
  checklist: { requiredTotal: number; requiredCompleted: number };
  materials: MaterialSummaryRow | null;
};

type DigestSection = {
  dayKey: string;
  sectionLabel: string;
  cards: JobCard[];
};

type DailyDigestContext = {
  orgId: string;
  timeZone: string;
  baseDayKey: string;
  includeTomorrow: boolean;
  dayKeys: string[];
  assignmentsByDay: Map<string, AssignmentRow[]>;
  assignments: AssignmentRow[];
  crewIds: string[];
  crewRecipients: Map<string, CrewRecipient>;
  taskSummaryByJobId: Map<string, TaskSummaryRow>;
  materialSummaryByJobId: Map<string, MaterialSummaryRow>;
  contactByJobId: Map<string, ContactRow | null>;
  dayLabels: Map<string, { dayName: string; dateLabel: string }>;
};

type CrewDigestPayload = {
  crewId: string;
  crewName: string;
  email: string | null;
  userId: string | null;
  entityId: string;
  totalJobs: number;
  digest: {
    date: string;
    dayName: string;
    dateLabel: string;
    totalJobs: number;
    jobsHtml: string;
    jobsText: string;
    crewName: string;
  };
};

type CrewDigestSkip = {
  crewId: string;
  crewName: string;
  email: string | null;
  reason: string;
};

const DEFAULT_SEND_TIME = '06:00';
const DEFAULT_SEND_EMPTY = false;
const DEFAULT_INCLUDE_TOMORROW = false;
const DAILY_DIGEST_EVENT_KEY = 'daily_crew_digest';

function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function normalizeDayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseSendTime(value: string | null | undefined): { hour: number; minute: number } {
  const raw = value?.trim() || DEFAULT_SEND_TIME;
  const [hourRaw, minuteRaw] = raw.split(':');
  const hour = Number.parseInt(hourRaw ?? '', 10);
  const minute = Number.parseInt(minuteRaw ?? '', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { hour: 6, minute: 0 };
  }
  return { hour, minute };
}

function getOrgDayKey(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function getLocalTimeParts(date: Date, timeZone: string): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function formatDayName(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date);
}

function formatDateLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: '2-digit',
    month: 'short',
  }).formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return `${day} ${month}`.trim();
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatAddress(row: AssignmentRow): string {
  const parts = [
    row.addressLine1,
    row.addressLine2,
    row.suburb,
    row.state,
    row.postcode,
  ]
    .map((part) => (part ? String(part).trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
}

function buildRouteLink(destination: string, origin?: string | null): string {
  const base = 'https://www.google.com/maps/dir/?api=1';
  const destinationParam = `destination=${encodeURIComponent(destination)}`;
  const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : '';
  return `${base}&${destinationParam}${originParam}`;
}

function summarizeNotes(notes: string | null): string | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (trimmed.length <= 140) return trimmed;
  return `${trimmed.slice(0, 137)}...`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatStatusLabel(value: string): string {
  const normalized = value.replace(/_/g, ' ').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatPriorityLabel(value: string): string {
  const normalized = value.replace(/_/g, ' ').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function hashToUuid(input: string): string {
  const hex = createHash('sha256').update(input).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildDigestEntityId(orgId: string, crewId: string, dayKey: string, includeTomorrow: boolean): string {
  return hashToUuid(`${orgId}:${crewId}:${dayKey}:${includeTomorrow ? 'with_tomorrow' : 'today'}`);
}

async function loadOrgTimeZone(orgId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ timezone: orgSettings.timezone })
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId))
    .limit(1);
  return (
    row?.timezone ||
    process.env.ORG_TIMEZONE ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC'
  );
}

function shouldSendNow(now: Date, timeZone: string, sendTime: { hour: number; minute: number }): boolean {
  const local = getLocalTimeParts(now, timeZone);
  const nowMinutes = local.hour * 60 + local.minute;
  const targetMinutes = sendTime.hour * 60 + sendTime.minute;
  return nowMinutes >= targetMinutes;
}

function resolveStartOfDay(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function addDays(dayKey: string, days: number): Date {
  const date = resolveStartOfDay(dayKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function listAssignmentsForDay(orgId: string, dayKey: string): Promise<AssignmentRow[]> {
  const db = getDb();
  const startOfDay = resolveStartOfDay(dayKey);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  return await db
    .select({
      assignmentId: scheduleAssignments.id,
      crewId: scheduleAssignments.crewId,
      date: scheduleAssignments.date,
      startMinutes: scheduleAssignments.startMinutes,
      endMinutes: scheduleAssignments.endMinutes,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      jobPriority: jobs.priority,
      addressLine1: jobs.addressLine1,
      addressLine2: jobs.addressLine2,
      suburb: jobs.suburb,
      state: jobs.state,
      postcode: jobs.postcode,
      notes: jobs.notes,
    })
    .from(scheduleAssignments)
    .innerJoin(jobs, eq(scheduleAssignments.jobId, jobs.id))
    .where(
      and(
        eq(scheduleAssignments.orgId, orgId),
        gte(scheduleAssignments.date, startOfDay),
        lt(scheduleAssignments.date, endOfDay),
        ne(scheduleAssignments.status, 'cancelled')
      )
    );
}

async function loadCrewRecipients(orgId: string, crewIds: string[]): Promise<Map<string, CrewRecipient>> {
  if (crewIds.length === 0) return new Map();
  const db = getDb();
  const userRows = await db
    .select({
      crewMemberId: orgMemberships.crewMemberId,
      userId: users.id,
      email: users.email,
      name: users.name,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(and(eq(orgMemberships.orgId, orgId), inArray(orgMemberships.crewMemberId, crewIds)));

  const crewRows = await db
    .select({
      id: crewMembers.id,
      firstName: crewMembers.firstName,
      lastName: crewMembers.lastName,
      displayName: crewMembers.displayName,
      email: crewMembers.email,
    })
    .from(crewMembers)
    .where(and(eq(crewMembers.orgId, orgId), inArray(crewMembers.id, crewIds)));

  const crewById = new Map(
    crewRows.map((row) => [
      row.id,
      row.displayName || `${row.firstName} ${row.lastName}`.trim(),
    ])
  );
  const emailByCrewId = new Map(crewRows.map((row) => [row.id, row.email ?? null]));

  const recipients = new Map<string, CrewRecipient>();
  for (const row of userRows) {
    const crewId = row.crewMemberId ?? null;
    if (!crewId) continue;
    recipients.set(crewId, {
      crewId,
      crewName: crewById.get(crewId) ?? row.name ?? row.email ?? `Crew ${crewId.slice(0, 8)}`,
      email: row.email ?? emailByCrewId.get(crewId) ?? null,
      userId: row.userId ?? null,
    });
  }

  for (const [crewId, crewName] of crewById.entries()) {
    if (recipients.has(crewId)) continue;
    recipients.set(crewId, {
      crewId,
      crewName,
      email: emailByCrewId.get(crewId) ?? null,
      userId: null,
    });
  }

  return recipients;
}

async function loadTaskSummary(orgId: string, jobIds: string[]): Promise<Map<string, TaskSummaryRow>> {
  if (jobIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      jobId: tasks.jobId,
      requiredTotal: sql<number>`sum(case when ${tasks.isRequired} then 1 else 0 end)`.mapWith(Number),
      requiredCompleted: sql<number>`sum(case when ${tasks.isRequired} and ${tasks.status} = 'completed' then 1 else 0 end)`.mapWith(Number),
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), inArray(tasks.jobId, jobIds)))
    .groupBy(tasks.jobId);

  const byJobId = new Map<string, TaskSummaryRow>();
  rows.forEach((row) => {
    byJobId.set(String(row.jobId), {
      jobId: String(row.jobId),
      requiredTotal: Number(row.requiredTotal ?? 0),
      requiredCompleted: Number(row.requiredCompleted ?? 0),
    });
  });
  return byJobId;
}

async function loadMaterialSummary(orgId: string, jobIds: string[]): Promise<Map<string, MaterialSummaryRow>> {
  if (jobIds.length === 0) return new Map();
  const db = getDb();

  const plannedRows = await db
    .select({
      jobId: jobMaterialAllocations.jobId,
      plannedCount: sql<number>`count(*)`.mapWith(Number),
      plannedQuantity: sql<number>`sum(${jobMaterialAllocations.plannedQuantity})`.mapWith(Number),
    })
    .from(jobMaterialAllocations)
    .where(and(eq(jobMaterialAllocations.orgId, orgId), inArray(jobMaterialAllocations.jobId, jobIds)))
    .groupBy(jobMaterialAllocations.jobId);

  const loggedRows = await db
    .select({
      jobId: materialUsageLogs.jobId,
      loggedCount: sql<number>`count(*)`.mapWith(Number),
      loggedQuantity: sql<number>`sum(${materialUsageLogs.quantityUsed})`.mapWith(Number),
    })
    .from(materialUsageLogs)
    .where(and(eq(materialUsageLogs.orgId, orgId), inArray(materialUsageLogs.jobId, jobIds)))
    .groupBy(materialUsageLogs.jobId);

  const byJobId = new Map<string, MaterialSummaryRow>();
  plannedRows.forEach((row) => {
    byJobId.set(String(row.jobId), {
      jobId: String(row.jobId),
      plannedCount: Number(row.plannedCount ?? 0),
      plannedQuantity: toNumber(row.plannedQuantity ?? 0),
      loggedCount: 0,
      loggedQuantity: 0,
    });
  });

  loggedRows.forEach((row) => {
    const jobId = String(row.jobId);
    const existing = byJobId.get(jobId) ?? {
      jobId,
      plannedCount: 0,
      plannedQuantity: 0,
      loggedCount: 0,
      loggedQuantity: 0,
    };
    existing.loggedCount = Number(row.loggedCount ?? 0);
    existing.loggedQuantity = toNumber(row.loggedQuantity ?? 0);
    byJobId.set(jobId, existing);
  });

  return byJobId;
}

async function loadContacts(orgId: string, jobIds: string[]): Promise<Map<string, ContactRow | null>> {
  if (jobIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      jobId: jobContacts.jobId,
      name: jobContacts.name,
      role: jobContacts.role,
      phone: jobContacts.phone,
      email: jobContacts.email,
    })
    .from(jobContacts)
    .where(and(eq(jobContacts.orgId, orgId), inArray(jobContacts.jobId, jobIds)));

  const byJobId = new Map<string, ContactRow | null>();
  for (const row of rows) {
    const jobId = String(row.jobId);
    const role = String(row.role ?? '').toLowerCase();
    const isSite = role.includes('site') || role.includes('onsite');
    if (!byJobId.has(jobId) || isSite) {
      byJobId.set(jobId, {
        jobId,
        name: row.name,
        role: row.role ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
      });
    }
  }
  return byJobId;
}

async function loadTemplateVersion(orgId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ version: commTemplates.version })
    .from(commTemplates)
    .where(and(eq(commTemplates.orgId, orgId), eq(commTemplates.key, DAILY_DIGEST_EVENT_KEY), eq(commTemplates.channel, 'email')))
    .orderBy(desc(commTemplates.version))
    .limit(1);
  return Number(row?.version ?? 1);
}

function buildJobHtml(card: JobCard): string {
  const status = escapeHtml(formatStatusLabel(card.status));
  const priority = escapeHtml(formatPriorityLabel(card.priority));
  const title = escapeHtml(card.title);
  const timeWindow = escapeHtml(card.timeWindow);
  const address = escapeHtml(card.address);

  const badgeStyle =
    'display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;margin-left:8px;background:#f3f4f6;color:#111827;';
  const priorityStyle =
    'display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;margin-left:6px;background:#fde68a;color:#92400e;';

  const routeHtml = card.routeUrl
    ? `<a href="${escapeHtml(card.routeUrl)}" style="display:inline-block;margin-top:8px;padding:8px 12px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;">Open route</a>`
    : '';

  const notesHtml = card.notesSummary
    ? `<div style="margin-top:8px;"><strong>Notes:</strong> ${escapeHtml(card.notesSummary)}</div>`
    : '';

  const contact = card.contact;
  const phone = normalizePhone(contact?.phone ?? null);
  const contactLines = contact
    ? `<div style="margin-top:8px;"><strong>Site contact:</strong> ${escapeHtml(contact.name)}${
        phone ? ` · <a href="tel:${escapeHtml(phone)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(phone)}</a>` : ''
      }${contact?.email ? ` · <a href="mailto:${escapeHtml(contact.email)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(contact.email)}</a>` : ''}</div>`
    : '';

  const checklist =
    card.checklist.requiredTotal > 0
      ? `${card.checklist.requiredCompleted}/${card.checklist.requiredTotal} required steps complete`
      : 'No required steps';

  const hasMaterials =
    card.materials &&
    (card.materials.plannedCount > 0 || card.materials.loggedCount > 0);
  const materials = hasMaterials
    ? `Planned ${card.materials?.plannedCount ?? 0} · Logged ${card.materials?.loggedCount ?? 0}`
    : null;

  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-top:12px;background:#ffffff;">
      <div style="font-weight:600;font-size:15px;color:#111827;">
        ${title}
        <span style="${badgeStyle}">${status}</span>
        <span style="${priorityStyle}">${priority}</span>
      </div>
      <div style="margin-top:6px;color:#374151;">${timeWindow}</div>
      <div style="margin-top:6px;color:#6b7280;">${address}</div>
      ${routeHtml}
      ${notesHtml}
      ${contactLines}
      <div style="margin-top:8px;color:#374151;"><strong>Checklist:</strong> ${escapeHtml(checklist)}</div>
      ${materials ? `<div style="margin-top:6px;color:#374151;"><strong>Materials:</strong> ${escapeHtml(materials)}</div>` : ''}
    </div>
  `.trim();
}

function buildJobsHtml(sectionLabel: string, cards: JobCard[]): string {
  const header = `<div style="margin-top:18px;font-weight:600;color:#111827;">${escapeHtml(sectionLabel)}</div>`;
  if (cards.length === 0) {
    return `${header}<div style="margin-top:8px;color:#6b7280;">No jobs assigned.</div>`;
  }
  const body = cards.map(buildJobHtml).join('');
  return `${header}${body}`;
}

function buildJobsText(sectionLabel: string, cards: JobCard[]): string {
  const lines = [`${sectionLabel}`];
  if (cards.length === 0) {
    lines.push('  - No jobs assigned.');
    return lines.join('\n');
  }
  for (const card of cards) {
    lines.push(`- ${card.timeWindow} | ${card.title} (${formatStatusLabel(card.status)}, ${formatPriorityLabel(card.priority)})`);
    lines.push(`  Address: ${card.address}`);
    if (card.routeUrl) lines.push(`  Route: ${card.routeUrl}`);
    if (card.notesSummary) lines.push(`  Notes: ${card.notesSummary}`);
    if (card.contact) {
      const contactParts = [card.contact.name, card.contact.phone, card.contact.email].filter(Boolean);
      lines.push(`  Contact: ${contactParts.join(' · ')}`);
    }
    if (card.checklist.requiredTotal > 0) {
      lines.push(`  Checklist: ${card.checklist.requiredCompleted}/${card.checklist.requiredTotal} required steps complete`);
    } else {
      lines.push('  Checklist: No required steps');
    }
    if (card.materials) {
      lines.push(`  Materials: planned ${card.materials.plannedCount} / logged ${card.materials.loggedCount}`);
    }
  }
  return lines.join('\n');
}

function buildDayLabels(dayKeys: string[], timeZone: string): Map<string, { dayName: string; dateLabel: string }> {
  const labels = new Map<string, { dayName: string; dateLabel: string }>();
  for (const dayKey of dayKeys) {
    const date = resolveStartOfDay(dayKey);
    labels.set(dayKey, {
      dayName: formatDayName(date, timeZone),
      dateLabel: formatDateLabel(date, timeZone),
    });
  }
  return labels;
}

async function loadDailyDigestContext(params: {
  orgId: string;
  baseDayKey: string;
  includeTomorrow: boolean;
  timeZone?: string | null;
}): Promise<DailyDigestContext> {
  const timeZone = params.timeZone ?? (await loadOrgTimeZone(params.orgId));
  const tomorrowKey = params.includeTomorrow ? getOrgDayKey(addDays(params.baseDayKey, 1), timeZone) : null;
  const dayKeys = [params.baseDayKey, ...(tomorrowKey ? [tomorrowKey] : [])];

  const assignmentsByDay = new Map<string, AssignmentRow[]>();
  for (const dayKey of dayKeys) {
    const rows = await listAssignmentsForDay(params.orgId, dayKey);
    assignmentsByDay.set(dayKey, rows);
  }

  const assignments = Array.from(assignmentsByDay.values()).flat();
  const db = getDb();
  const crewRows = await db
    .select({ id: crewMembers.id })
    .from(crewMembers)
    .where(and(eq(crewMembers.orgId, params.orgId), eq(crewMembers.active, true)));

  const assignedCrewIds = assignments
    .map((row) => row.crewId)
    .filter((crewId): crewId is string => Boolean(crewId));
  const crewIds = Array.from(new Set([...assignedCrewIds, ...crewRows.map((row) => row.id)]));
  const crewRecipients = await loadCrewRecipients(params.orgId, crewIds);
  const jobIds = Array.from(new Set(assignments.map((row) => row.jobId)));

  const taskSummaryByJobId = await loadTaskSummary(params.orgId, jobIds);
  const materialSummaryByJobId = await loadMaterialSummary(params.orgId, jobIds);
  const contactByJobId = await loadContacts(params.orgId, jobIds);
  const dayLabels = buildDayLabels(dayKeys, timeZone);

  return {
    orgId: params.orgId,
    timeZone,
    baseDayKey: params.baseDayKey,
    includeTomorrow: params.includeTomorrow,
    dayKeys,
    assignmentsByDay,
    assignments,
    crewIds,
    crewRecipients,
    taskSummaryByJobId,
    materialSummaryByJobId,
    contactByJobId,
    dayLabels,
  };
}

function buildCrewSections(context: DailyDigestContext, crewId: string): DigestSection[] {
  return context.dayKeys.map((dayKey) => {
    const rows = (context.assignmentsByDay.get(dayKey) ?? []).filter((row) => row.crewId === crewId);
    rows.sort((a, b) => a.startMinutes - b.startMinutes);
    const cards: JobCard[] = rows.map((assignment, index) => {
      const range = assignmentToDateRange(new Date(assignment.date), assignment.startMinutes, assignment.endMinutes);
      const address = formatAddress(assignment);
      const timeWindow = `${formatTime(range.scheduledStart, context.timeZone)} - ${formatTime(range.scheduledEnd, context.timeZone)}`;
      const previous = rows[index - 1];
      const originAddress = previous ? formatAddress(previous) : null;
      const routeUrl = address ? buildRouteLink(address, originAddress) : null;
      const notesSummary = summarizeNotes(assignment.notes);
      const contact = context.contactByJobId.get(assignment.jobId) ?? null;
      const tasksSummary = context.taskSummaryByJobId.get(assignment.jobId) ?? { requiredTotal: 0, requiredCompleted: 0 };
      const materialsSummary = context.materialSummaryByJobId.get(assignment.jobId) ?? null;

      return {
        id: assignment.jobId,
        title: assignment.jobTitle,
        status: assignment.jobStatus,
        priority: assignment.jobPriority,
        timeWindow,
        address,
        notesSummary,
        routeUrl,
        contact,
        checklist: {
          requiredTotal: tasksSummary.requiredTotal,
          requiredCompleted: tasksSummary.requiredCompleted,
        },
        materials: materialsSummary,
      };
    });

    const labelMeta = context.dayLabels.get(dayKey);
    const sectionLabel =
      dayKey === context.baseDayKey
        ? `Today Aú ${labelMeta?.dayName ?? ''} ${labelMeta?.dateLabel ?? ''}`.trim()
        : `Tomorrow Aú ${labelMeta?.dayName ?? ''} ${labelMeta?.dateLabel ?? ''}`.trim();
    return {
      dayKey,
      sectionLabel,
      cards,
    };
  });
}

function buildCrewDigestPayload(
  context: DailyDigestContext,
  recipient: CrewRecipient,
  sendEmpty: boolean
): CrewDigestPayload | null {
  const sections = buildCrewSections(context, recipient.crewId);
  const totalJobs = sections.reduce((sum, section) => sum + section.cards.length, 0);
  if (totalJobs === 0 && !sendEmpty) return null;

  const jobsHtml = sections.map((section) => buildJobsHtml(section.sectionLabel, section.cards)).join('');
  const jobsText = sections.map((section) => buildJobsText(section.sectionLabel, section.cards)).join('\n\n');
  const primaryLabel = context.dayLabels.get(context.baseDayKey);
  const entityId = buildDigestEntityId(context.orgId, recipient.crewId, context.baseDayKey, context.includeTomorrow);

  return {
    crewId: recipient.crewId,
    crewName: recipient.crewName,
    email: recipient.email ?? null,
    userId: recipient.userId ?? null,
    entityId,
    totalJobs,
    digest: {
      date: context.baseDayKey,
      dayName: primaryLabel?.dayName ?? '',
      dateLabel: primaryLabel?.dateLabel ?? '',
      totalJobs,
      jobsHtml,
      jobsText,
      crewName: recipient.crewName,
    },
  };
}

export async function buildDailyCrewDigestPreviews(params: {
  orgId: string;
  date?: string | null;
  includeTomorrow?: boolean | null;
  sendEmpty?: boolean | null;
  crewId?: string | null;
  now?: Date;
}): Promise<{ baseDayKey: string; timeZone: string; previews: CrewDigestPayload[]; skipped: CrewDigestSkip[] }> {
  const now = params.now ?? new Date();
  const includeTomorrow =
    params.includeTomorrow ?? parseBoolean(process.env.DAILY_CREW_EMAIL_INCLUDE_TOMORROW, DEFAULT_INCLUDE_TOMORROW);
  const sendEmpty =
    params.sendEmpty ?? parseBoolean(process.env.DAILY_CREW_EMAIL_SEND_EMPTY, DEFAULT_SEND_EMPTY);
  const timeZone = await loadOrgTimeZone(params.orgId);
  const dateOverride = normalizeDayKey(params.date ?? null);
  const baseDayKey = dateOverride ?? getOrgDayKey(now, timeZone);
  const context = await loadDailyDigestContext({
    orgId: params.orgId,
    baseDayKey,
    includeTomorrow,
    timeZone,
  });
  const crewIds = params.crewId ? [params.crewId] : context.crewIds;

  const previews: CrewDigestPayload[] = [];
  const skipped: CrewDigestSkip[] = [];

  for (const crewId of crewIds) {
    const recipient = context.crewRecipients.get(crewId) ?? null;
    const crewName = recipient?.crewName ?? `Crew ${crewId.slice(0, 8)}`;
    const email = recipient?.email ?? null;
    if (!recipient) {
      skipped.push({ crewId, crewName, email, reason: 'missing_recipient' });
      continue;
    }
    if (!email) {
      skipped.push({ crewId, crewName, email, reason: 'missing_email' });
      continue;
    }
    const payload = buildCrewDigestPayload(context, recipient, sendEmpty);
    if (!payload) {
      skipped.push({ crewId, crewName: recipient.crewName, email, reason: 'no_assignments' });
      continue;
    }
    previews.push(payload);
  }

  return { baseDayKey, timeZone, previews, skipped };
}

async function loadExistingOutboxKeys(params: {
  orgId: string;
  entityIds: string[];
  templateVersion: number;
}): Promise<Set<string>> {
  if (params.entityIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({
      entityId: commOutbox.entityId,
      recipientUserId: commOutbox.recipientUserId,
      recipientEmail: commOutbox.recipientEmail,
    })
    .from(commOutbox)
    .where(
      and(
        eq(commOutbox.orgId, params.orgId),
        eq(commOutbox.eventKey, DAILY_DIGEST_EVENT_KEY),
        eq(commOutbox.channel, 'email'),
        eq(commOutbox.templateVersion, params.templateVersion),
        inArray(commOutbox.entityId, params.entityIds)
      )
    );

  const keys = new Set<string>();
  rows.forEach((row) => {
    const recipientKey = row.recipientUserId ?? row.recipientEmail ?? '';
    keys.add(`${row.entityId}:${recipientKey}`);
  });
  return keys;
}

export async function runDailyCrewDigest(params: {
  orgId?: string;
  date?: string | null;
  includeTomorrow?: boolean | null;
  sendEmpty?: boolean | null;
  force?: boolean | null;
  now?: Date;
  source?: string;
}): Promise<void> {
  const db = getDb();
  const orgRows = params.orgId
    ? [{ id: params.orgId }]
    : await db.select({ id: orgs.id }).from(orgs);

  const now = params.now ?? new Date();
  const featureEnabled = parseBoolean(process.env.DAILY_CREW_EMAIL_ENABLED, false);
  const sendTime = parseSendTime(process.env.DAILY_CREW_EMAIL_TIME);
  const includeTomorrow = params.includeTomorrow ?? parseBoolean(process.env.DAILY_CREW_EMAIL_INCLUDE_TOMORROW, DEFAULT_INCLUDE_TOMORROW);
  const sendEmpty = params.sendEmpty ?? parseBoolean(process.env.DAILY_CREW_EMAIL_SEND_EMPTY, DEFAULT_SEND_EMPTY);
  const force = Boolean(params.force);
  const source = params.source ?? 'cron';

  for (const orgRow of orgRows) {
    const orgId = orgRow.id;
    if (!featureEnabled && !force) {
      console.log(JSON.stringify({ event: 'daily_crew_digest.disabled', orgId }));
      continue;
    }
    const timeZone = await loadOrgTimeZone(orgId);
    if (!force && !params.date && !shouldSendNow(now, timeZone, sendTime)) {
      console.log(JSON.stringify({ event: 'daily_crew_digest.skip_time', orgId }));
      continue;
    }

    const dateOverride = normalizeDayKey(params.date ?? null);
    const baseDayKey = dateOverride ?? getOrgDayKey(now, timeZone);
    const context = await loadDailyDigestContext({
      orgId,
      baseDayKey,
      includeTomorrow,
      timeZone,
    });

    if (context.assignments.length === 0 && !sendEmpty) {
      console.log(JSON.stringify({ event: 'daily_crew_digest.no_assignments', orgId, dayKey: baseDayKey }));
      continue;
    }
    const templateVersion = await loadTemplateVersion(orgId);

    const entityIds = context.crewIds.map((crewId) =>
      buildDigestEntityId(orgId, crewId, baseDayKey, includeTomorrow)
    );
    const existingOutboxKeys = force ? new Set() : await loadExistingOutboxKeys({ orgId, entityIds, templateVersion });

    let sentCount = 0;
    let skippedCount = 0;

    for (const crewId of context.crewIds) {
      const recipient = context.crewRecipients.get(crewId) ?? null;
      if (!recipient || !recipient.email) {
        skippedCount += 1;
        continue;
      }

      const entityId = buildDigestEntityId(orgId, crewId, baseDayKey, includeTomorrow);
      const recipientKey = recipient.userId ?? recipient.email;
      if (!recipientKey) {
        skippedCount += 1;
        continue;
      }
      if (existingOutboxKeys.has(`${entityId}:${recipientKey}`)) {
        skippedCount += 1;
        continue;
      }

      const payload = buildCrewDigestPayload(context, recipient, sendEmpty);
      if (!payload) {
        skippedCount += 1;
        continue;
      }

      await emitCommEvent({
        orgId,
        eventKey: DAILY_DIGEST_EVENT_KEY,
        entityType: 'system',
        entityId: payload.entityId,
        triggeredByUserId: recipient.userId,
        source,
        payload: {
          digest: {
            date: payload.digest.date,
            dayName: payload.digest.dayName,
            dateLabel: payload.digest.dateLabel,
            totalJobs: payload.digest.totalJobs,
            jobsHtml: payload.digest.jobsHtml,
            jobsText: payload.digest.jobsText,
            crewName: payload.digest.crewName,
          },
          recipients: [
            {
              type: recipient.userId ? 'user' : 'custom',
              userId: recipient.userId,
              email: recipient.email,
              name: recipient.crewName,
              crewMemberId: recipient.crewId,
            },
          ],
        },
        actorRoleKey: 'system',
      });

      sentCount += 1;
    }
    console.log(
      JSON.stringify({
        event: 'daily_crew_digest.complete',
        orgId,
        dayKey: baseDayKey,
        sent: sentCount,
        skipped: skippedCount,
      })
    );
  }
}
