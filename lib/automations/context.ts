import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { AppEvent } from '@/db/schema/app_events';
import { jobs } from '@/db/schema/jobs';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import { materials } from '@/db/schema/materials';
import { jobContacts } from '@/db/schema/job_contacts';
import { crewMembers } from '@/db/schema/crew_members';
import { orgSettings } from '@/db/schema/org_settings';
import { orgMemberships } from '@/db/schema/org_memberships';
import { orgRoles } from '@/db/schema/org_roles';
import { users } from '@/db/schema/users';
import { materialInventoryEvents } from '@/db/schema/material_inventory_events';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { getReservedForMaterial } from '@/lib/queries/material_reservations';
import { getDb } from '@/lib/db';

type DbClient = ReturnType<typeof getDb>;

export type AutomationOrgUser = {
  userId: string;
  name: string | null;
  email: string | null;
  roleKey: string | null;
  crewMemberId: string | null;
};

type AutomationEvent = Pick<AppEvent, 'id' | 'orgId' | 'eventType' | 'payload' | 'createdAt' | 'actorUserId'>;

export type AutomationContext = {
  event: {
    id: string;
    type: string;
    occurredAt: string;
    payload: Record<string, unknown>;
    actorUserId: string | null;
  };
  job: Record<string, unknown> | null;
  assignment: Record<string, unknown> | null;
  material: Record<string, unknown> | null;
  entity: Record<string, unknown> | null;
  contacts: {
    client: Record<string, unknown> | null;
    siteContacts: Record<string, unknown>[];
  };
  crew: Record<string, unknown>[];
  org: {
    settings: Record<string, unknown> | null;
  };
  orgUsers: AutomationOrgUser[];
  computed: Record<string, unknown>;
};

function getString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeDateOnly(dateStr: string): Date | null {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Resolves context used by automation conditions and actions.
 */
export async function resolveAutomationContext(params: {
  db: DbClient;
  orgId: string;
  event: AutomationEvent;
}): Promise<AutomationContext> {
  const payload = (params.event.payload ?? {}) as Record<string, unknown>;
  const jobId = getString(payload.jobId);
  const assignmentId = getString(payload.assignmentId);
  const materialId = getString(payload.materialId);
  const crewId = getString(payload.crewId);
  const dateStr = getString(payload.date);

  const [settingsRow] = await params.db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, params.orgId))
    .limit(1);

  const [jobRow] = jobId
    ? await params.db
        .select()
        .from(jobs)
        .where(and(eq(jobs.orgId, params.orgId), eq(jobs.id, jobId)))
        .limit(1)
    : [null];

  const [assignmentRow] = assignmentId
    ? await params.db
        .select()
        .from(scheduleAssignments)
        .where(and(eq(scheduleAssignments.orgId, params.orgId), eq(scheduleAssignments.id, assignmentId)))
        .limit(1)
    : [null];

  const [materialRow] = materialId
    ? await params.db
        .select()
        .from(materials)
        .where(and(eq(materials.orgId, params.orgId), eq(materials.id, materialId)))
        .limit(1)
    : [null];

  const contactRows = jobId
    ? await params.db
        .select()
        .from(jobContacts)
        .where(and(eq(jobContacts.orgId, params.orgId), eq(jobContacts.jobId, jobId)))
    : [];

  const clientContact = contactRows.find((contact) => {
    const role = String(contact.role ?? '').toLowerCase();
    return role === 'client';
  }) ?? null;
  const siteContacts = contactRows.filter((contact) => {
    const role = String(contact.role ?? '').toLowerCase();
    return role.includes('site');
  });

  const crewIds = new Set<string>();
  if (crewId) crewIds.add(crewId);
  if (assignmentRow?.crewId) crewIds.add(assignmentRow.crewId);
  if (jobRow?.crewId) crewIds.add(jobRow.crewId);

  const crewRows =
    crewIds.size > 0
      ? await params.db
          .select()
          .from(crewMembers)
          .where(and(eq(crewMembers.orgId, params.orgId), inArray(crewMembers.id, Array.from(crewIds))))
      : [];

  const orgUsersRows = await params.db
    .select({
      userId: orgMemberships.userId,
      name: users.name,
      email: users.email,
      roleKey: orgRoles.key,
      crewMemberId: orgMemberships.crewMemberId,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .leftJoin(orgRoles, eq(orgMemberships.roleId, orgRoles.id))
    .where(and(eq(orgMemberships.orgId, params.orgId), eq(orgMemberships.status, 'active')));

  const orgUsers = orgUsersRows.map((row) => ({
    userId: row.userId,
    name: row.name ?? null,
    email: row.email ?? null,
    roleKey: row.roleKey ?? null,
    crewMemberId: row.crewMemberId ?? null,
  }));

  const computed: Record<string, unknown> = {};
  const now = new Date();
  computed.now = now.toISOString();

  if (assignmentRow && assignmentRow.startMinutes !== null && assignmentRow.endMinutes !== null) {
    const { startMinutes, endMinutes } = assignmentRow;
    computed.assignmentDurationMinutes = endMinutes - startMinutes;
    if (assignmentRow.date instanceof Date) {
      const start = new Date(assignmentRow.date);
      start.setMinutes(start.getMinutes() + startMinutes);
      const end = new Date(assignmentRow.date);
      end.setMinutes(end.getMinutes() + endMinutes);
      computed.scheduleStartAt = start.toISOString();
      computed.scheduleEndAt = end.toISOString();
    }
  } else if (jobRow?.scheduledStart && jobRow?.scheduledEnd) {
    const start = new Date(jobRow.scheduledStart);
    const end = new Date(jobRow.scheduledEnd);
    computed.jobDurationMinutes = Math.round((end.getTime() - start.getTime()) / (60 * 1000));
    computed.scheduleStartAt = start.toISOString();
    computed.scheduleEndAt = end.toISOString();
  }

  if (jobRow?.scheduledEnd) {
    const dueAt = new Date(jobRow.scheduledEnd);
    if (!Number.isNaN(dueAt.getTime())) {
      computed.jobOverdue = dueAt.getTime() < now.getTime() && jobRow.status !== 'completed';
    }
  }

  if (!computed.scheduleStartAt && dateStr && typeof payload.startMinutes === 'number') {
    const dateOnly = normalizeDateOnly(dateStr);
    if (dateOnly) {
      const start = new Date(dateOnly);
      start.setMinutes(start.getMinutes() + payload.startMinutes);
      computed.scheduleStartAt = start.toISOString();
    }
  }

  if (crewId && dateStr) {
    const dateOnly = normalizeDateOnly(dateStr);
    if (dateOnly) {
      const rows = await params.db
        .select({
          startMinutes: scheduleAssignments.startMinutes,
          endMinutes: scheduleAssignments.endMinutes,
        })
        .from(scheduleAssignments)
        .where(
          and(
            eq(scheduleAssignments.orgId, params.orgId),
            eq(scheduleAssignments.crewId, crewId),
            eq(scheduleAssignments.date, dateOnly)
          )
        );
      const totalMinutes = rows.reduce((sum, row) => sum + (row.endMinutes - row.startMinutes), 0);
      computed.crewDailyMinutes = totalMinutes;
    }
  }

  if (materialId) {
    const [stockRow] = await params.db
      .select({
        currentStock: sql<number>`coalesce(sum(${materialInventoryEvents.quantity}), 0)`.mapWith(Number),
      })
      .from(materialInventoryEvents)
      .where(and(eq(materialInventoryEvents.orgId, params.orgId), eq(materialInventoryEvents.materialId, materialId)));

    const reservedResult = await getReservedForMaterial({ orgId: params.orgId, materialId });
    const reserved = reservedResult.ok ? reservedResult.data : 0;
    const currentStock = Number(stockRow?.currentStock ?? 0);
    computed.materialCurrentStock = currentStock;
    computed.materialReserved = reserved;
    computed.materialAvailable = currentStock - reserved;

    const start30 = new Date(now);
    start30.setDate(start30.getDate() - 30);
    const [usageRow] = await params.db
      .select({
        usage30d: sql<number>`coalesce(sum(${materialUsageLogs.quantityUsed}), 0)`.mapWith(Number),
      })
      .from(materialUsageLogs)
      .where(
        and(
          eq(materialUsageLogs.orgId, params.orgId),
          eq(materialUsageLogs.materialId, materialId),
          gte(materialUsageLogs.createdAt, start30)
        )
      );
    const usage30d = Number(usageRow?.usage30d ?? 0);
    computed.materialUsage30dTotal = usage30d;
    computed.materialAvgDailyUsage30d = usage30d / 30;
  }

  const entity = assignmentRow ?? jobRow ?? materialRow ?? null;

  return {
    event: {
      id: params.event.id,
      type: params.event.eventType,
      occurredAt: params.event.createdAt?.toISOString?.() ?? new Date().toISOString(),
      payload,
      actorUserId: params.event.actorUserId ?? null,
    },
    job: jobRow ? { ...jobRow } : null,
    assignment: assignmentRow ? { ...assignmentRow } : null,
    material: materialRow ? { ...materialRow } : null,
    entity: entity ? { ...entity } : null,
    contacts: {
      client: clientContact ? { ...clientContact } : null,
      siteContacts: siteContacts.map((contact) => ({ ...contact })),
    },
    crew: crewRows.map((row) => ({ ...row })),
    org: {
      settings: settingsRow ? { ...settingsRow } : null,
    },
    orgUsers,
    computed,
  };
}
