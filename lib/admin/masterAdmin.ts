import { asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { auditLogs } from '@/db/schema/audit_logs';
import { orgMemberships } from '@/db/schema/org_memberships';
import { orgRoles } from '@/db/schema/org_roles';
import { orgs } from '@/db/schema/orgs';
import { passwordResets } from '@/db/schema/password_resets';
import { userSessions } from '@/db/schema/user_sessions';
import { users } from '@/db/schema/users';

export const MASTER_ADMIN_EMAIL = 'malakye@easyflow.au';

type PageMeta = {
  key: string;
  label: string;
  route: string;
};

type ModuleLinkDef = {
  key: string;
  pageKey: string;
  table: string;
  userColumn: string;
  linkageLabel: string;
};

type OrgTotalDef = {
  pageKey: string;
  table: string;
};

type ModuleUserCount = {
  moduleKey: string;
  pageKey: string;
  table: string;
  linkageLabel: string;
  orgId: string;
  userId: string;
  total: number;
};

type OrgPageTotal = {
  pageKey: string;
  orgId: string;
  total: number;
};

type ModuleAggregate = {
  key: string;
  pageKey: string;
  table: string;
  linkageLabel: string;
  total: number;
  byOrg: Map<string, number>;
};

export type MasterAdminInsightData = {
  generatedAt: Date;
  summary: {
    usersTotal: number;
    usersActive: number;
    usersInvited: number;
    usersDisabled: number;
    usersLoggedIn7d: number;
    orgsTotal: number;
  };
  orgs: Array<{ id: string; name: string }>;
  orgPageTotals: Array<{
    orgId: string;
    orgName: string;
    totals: Array<{ pageKey: string; pageLabel: string; route: string; total: number }>;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    status: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    lastLoginAt: Date | null;
    memberships: Array<{
      membershipId: string;
      orgId: string;
      orgName: string;
      roleId: string | null;
      roleKey: string | null;
      roleName: string | null;
      status: string;
      crewMemberId: string | null;
      createdAt: Date | null;
    }>;
    sessions: {
      total: number;
      active: number;
      revoked: number;
      lastSeenAt: Date | null;
      lastSessionCreatedAt: Date | null;
      latestExpiryAt: Date | null;
    };
    security: {
      passwordResetRequests: number;
      passwordResetUsed: number;
      lastPasswordResetAt: Date | null;
    };
    activity: {
      auditEventsTotal: number;
      auditEvents7d: number;
      auditEvents30d: number;
      lastAuditEventAt: Date | null;
      topActions: Array<{ action: string; total: number }>;
      topEntities: Array<{ entityType: string; total: number }>;
    };
    moduleContributions: Array<{
      key: string;
      pageKey: string;
      pageLabel: string;
      route: string;
      table: string;
      linkageLabel: string;
      total: number;
      byOrg: Array<{ orgId: string; orgName: string; total: number }>;
    }>;
    orgInsights: Array<{
      orgId: string;
      orgName: string;
      pageTotals: Array<{ pageKey: string; pageLabel: string; route: string; total: number }>;
      userOwnedTotals: Array<{ pageKey: string; pageLabel: string; route: string; total: number }>;
    }>;
  }>;
  recentAuditEvents: Array<{
    id: string;
    orgId: string;
    orgName: string;
    actorUserId: string | null;
    actorEmail: string | null;
    actorName: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: Date | null;
  }>;
};

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

const PAGE_META: Record<string, PageMeta> = {
  auth: { key: 'auth', label: 'Auth & Access', route: '/settings' },
  dashboard: { key: 'dashboard', label: 'Dashboard', route: '/dashboard' },
  contacts: { key: 'contacts', label: 'Contacts', route: '/contacts' },
  appraisals: { key: 'appraisals', label: 'Appraisals', route: '/appraisals' },
  listings: { key: 'listings', label: 'Listings', route: '/listings' },
  calendar: { key: 'calendar', label: 'Calendar', route: '/schedule' },
  followups: { key: 'followups', label: 'Follow-ups', route: '/follow-ups' },
  reports: { key: 'reports', label: 'Reports', route: '/reports' },
  invoices: { key: 'invoices', label: 'Invoices', route: '/invoices' },
  automations: { key: 'automations', label: 'Automations', route: '/settings/automations' },
  notifications: { key: 'notifications', label: 'Notifications', route: '/notifications' },
  announcements: { key: 'announcements', label: 'Announcements', route: '/announcements' },
  jobs: { key: 'jobs', label: 'Jobs', route: '/jobs' },
  operations: { key: 'operations', label: 'Operations', route: '/operations' },
  materials: { key: 'materials', label: 'Warehouse', route: '/warehouse' },
  communications: { key: 'communications', label: 'Communications', route: '/settings/communications' },
  integrations: { key: 'integrations', label: 'Integrations', route: '/settings/integrations' },
};

const MODULE_LINK_DEFS: ModuleLinkDef[] = [
  { key: 'contacts_owner', pageKey: 'contacts', table: 'contacts', userColumn: 'owner_user_id', linkageLabel: 'Owner' },
  { key: 'appraisals_owner', pageKey: 'appraisals', table: 'appraisals', userColumn: 'owner_user_id', linkageLabel: 'Owner' },
  { key: 'listings_owner', pageKey: 'listings', table: 'listings', userColumn: 'owner_user_id', linkageLabel: 'Owner' },
  { key: 'calendar_assigned', pageKey: 'calendar', table: 'calendar_events', userColumn: 'assigned_to_user_id', linkageLabel: 'Assigned to' },
  { key: 'calendar_created', pageKey: 'calendar', table: 'calendar_events', userColumn: 'created_by_user_id', linkageLabel: 'Created by' },
  { key: 'appraisal_checklist_assigned', pageKey: 'appraisals', table: 'appraisal_checklist_items', userColumn: 'assigned_to_user_id', linkageLabel: 'Checklist assigned' },
  { key: 'listing_checklist_assigned', pageKey: 'listings', table: 'listing_checklist_items', userColumn: 'assigned_to_user_id', linkageLabel: 'Checklist assigned' },
  { key: 'listing_milestones_assigned', pageKey: 'listings', table: 'listing_milestones', userColumn: 'assigned_to_user_id', linkageLabel: 'Milestone assigned' },
  { key: 'contact_activities_created', pageKey: 'contacts', table: 'contact_activities', userColumn: 'created_by_user_id', linkageLabel: 'Activity logged by' },
  { key: 'listing_enquiries_created', pageKey: 'listings', table: 'listing_enquiries', userColumn: 'created_by_user_id', linkageLabel: 'Enquiry logged by' },
  { key: 'listing_reports_created', pageKey: 'reports', table: 'listing_reports', userColumn: 'created_by_user_id', linkageLabel: 'Report created by' },
  { key: 'listing_vendor_comms_created', pageKey: 'communications', table: 'listing_vendor_comms', userColumn: 'created_by_user_id', linkageLabel: 'Vendor comm logged by' },
  { key: 'report_drafts_created', pageKey: 'reports', table: 'report_drafts', userColumn: 'created_by_user_id', linkageLabel: 'Draft created by' },
  { key: 'followup_snoozes_created', pageKey: 'followups', table: 'followup_snoozes', userColumn: 'created_by_user_id', linkageLabel: 'Snooze created by' },
  { key: 'automation_rules_created', pageKey: 'automations', table: 'automation_rules', userColumn: 'created_by_user_id', linkageLabel: 'Rule created by' },
  { key: 'automation_rules_updated', pageKey: 'automations', table: 'automation_rules', userColumn: 'updated_by_user_id', linkageLabel: 'Rule updated by' },
  { key: 'app_events_actor', pageKey: 'operations', table: 'app_events', userColumn: 'actor_user_id', linkageLabel: 'App event actor' },
  { key: 'audit_logs_actor', pageKey: 'dashboard', table: 'audit_logs', userColumn: 'actor_user_id', linkageLabel: 'Audit actor' },
  { key: 'org_invites_created', pageKey: 'auth', table: 'org_invites', userColumn: 'created_by_user_id', linkageLabel: 'Invite created by' },
  { key: 'user_sessions_user', pageKey: 'auth', table: 'user_sessions', userColumn: 'user_id', linkageLabel: 'Session owner' },
];

const ORG_TOTAL_DEFS: OrgTotalDef[] = [
  { pageKey: 'contacts', table: 'contacts' },
  { pageKey: 'appraisals', table: 'appraisals' },
  { pageKey: 'listings', table: 'listings' },
  { pageKey: 'calendar', table: 'calendar_events' },
  { pageKey: 'followups', table: 'tasks' },
  { pageKey: 'reports', table: 'listing_reports' },
  { pageKey: 'reports', table: 'report_drafts' },
  { pageKey: 'invoices', table: 'job_invoices' },
  { pageKey: 'invoices', table: 'job_payments' },
  { pageKey: 'automations', table: 'automation_rules' },
  { pageKey: 'automations', table: 'automation_rule_runs' },
  { pageKey: 'notifications', table: 'notifications' },
  { pageKey: 'announcements', table: 'announcements' },
  { pageKey: 'jobs', table: 'jobs' },
  { pageKey: 'materials', table: 'materials' },
  { pageKey: 'communications', table: 'comm_events' },
  { pageKey: 'communications', table: 'comm_outbox' },
  { pageKey: 'integrations', table: 'integration_events' },
];

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || !('rows' in value)) {
    return [];
  }
  const rows = (value as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

function isSkippableSchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  // 42P01: undefined_table, 42703: undefined_column
  return code === '42P01' || code === '42703';
}

async function queryModuleUserCounts(): Promise<ModuleUserCount[]> {
  const db = getDb();
  const batches = await Promise.all(
    MODULE_LINK_DEFS.map(async (def) => {
      const table = quoteIdentifier(def.table);
      const userColumn = quoteIdentifier(def.userColumn);
      const query = `
        select
          org_id::text as "orgId",
          ${userColumn}::text as "userId",
          count(*)::bigint as "total"
        from public.${table}
        where ${userColumn} is not null
        group by org_id, ${userColumn}
      `;
      try {
        const result = await db.execute(sql.raw(query));
        const rows = asRows(result);
        return rows
          .map((row): ModuleUserCount | null => {
            const orgId = asString(row.orgId);
            const userId = asString(row.userId);
            if (!orgId || !userId) return null;
            return {
              moduleKey: def.key,
              pageKey: def.pageKey,
              table: def.table,
              linkageLabel: def.linkageLabel,
              orgId,
              userId,
              total: asNumber(row.total),
            };
          })
          .filter((row): row is ModuleUserCount => Boolean(row));
      } catch (error) {
        if (isSkippableSchemaError(error)) return [];
        throw error;
      }
    })
  );
  return batches.flat();
}

async function queryOrgPageTotals(): Promise<OrgPageTotal[]> {
  const db = getDb();
  const batches = await Promise.all(
    ORG_TOTAL_DEFS.map(async (def) => {
      const table = quoteIdentifier(def.table);
      const query = `
        select
          org_id::text as "orgId",
          count(*)::bigint as "total"
        from public.${table}
        group by org_id
      `;
      try {
        const result = await db.execute(sql.raw(query));
        const rows = asRows(result);
        return rows
          .map((row): OrgPageTotal | null => {
            const orgId = asString(row.orgId);
            if (!orgId) return null;
            return {
              pageKey: def.pageKey,
              orgId,
              total: asNumber(row.total),
            };
          })
          .filter((row): row is OrgPageTotal => Boolean(row));
      } catch (error) {
        if (isSkippableSchemaError(error)) return [];
        throw error;
      }
    })
  );
  return batches.flat();
}

export function isMasterAdminEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === MASTER_ADMIN_EMAIL;
}

export async function getMasterAdminInsights(): Promise<MasterAdminInsightData> {
  const db = getDb();
  const now = new Date();
  const start7 = new Date(now);
  start7.setDate(start7.getDate() - 7);
  const start30 = new Date(now);
  start30.setDate(start30.getDate() - 30);

  const [orgRows, membershipRows, sessionRows, passwordResetRows, auditSummaryRows, auditActionRows, auditEntityRows, recentAuditRows, moduleRows, orgPageRows] =
    await Promise.all([
      db.select({ id: orgs.id, name: orgs.name }).from(orgs).orderBy(asc(orgs.name)),
      db
        .select({
          userId: users.id,
          userEmail: users.email,
          userName: users.name,
          userStatus: users.status,
          userCreatedAt: users.createdAt,
          userUpdatedAt: users.updatedAt,
          userLastLoginAt: users.lastLoginAt,
          membershipId: orgMemberships.id,
          membershipStatus: orgMemberships.status,
          membershipCreatedAt: orgMemberships.createdAt,
          membershipCrewMemberId: orgMemberships.crewMemberId,
          orgId: orgs.id,
          orgName: orgs.name,
          roleId: orgRoles.id,
          roleKey: orgRoles.key,
          roleName: orgRoles.name,
        })
        .from(users)
        .leftJoin(orgMemberships, eq(orgMemberships.userId, users.id))
        .leftJoin(orgs, eq(orgMemberships.orgId, orgs.id))
        .leftJoin(orgRoles, eq(orgMemberships.roleId, orgRoles.id))
        .orderBy(asc(users.email), asc(orgMemberships.createdAt)),
      db
        .select({
          userId: userSessions.userId,
          totalSessions: sql<number>`count(*)`.mapWith(Number),
          activeSessions:
            sql<number>`sum(case when ${userSessions.revokedAt} is null and ${userSessions.expiresAt} > now() then 1 else 0 end)`.mapWith(
              Number
            ),
          revokedSessions: sql<number>`sum(case when ${userSessions.revokedAt} is not null then 1 else 0 end)`.mapWith(Number),
          lastSeenAt: sql<Date | null>`max(${userSessions.lastSeenAt})`,
          lastSessionCreatedAt: sql<Date | null>`max(${userSessions.createdAt})`,
          latestExpiryAt: sql<Date | null>`max(${userSessions.expiresAt})`,
        })
        .from(userSessions)
        .groupBy(userSessions.userId),
      db
        .select({
          userId: passwordResets.userId,
          total: sql<number>`count(*)`.mapWith(Number),
          used: sql<number>`sum(case when ${passwordResets.usedAt} is not null then 1 else 0 end)`.mapWith(Number),
          latestCreatedAt: sql<Date | null>`max(${passwordResets.createdAt})`,
        })
        .from(passwordResets)
        .groupBy(passwordResets.userId),
      db
        .select({
          userId: auditLogs.actorUserId,
          total: sql<number>`count(*)`.mapWith(Number),
          events7d: sql<number>`sum(case when ${auditLogs.createdAt} >= ${start7} then 1 else 0 end)`.mapWith(Number),
          events30d: sql<number>`sum(case when ${auditLogs.createdAt} >= ${start30} then 1 else 0 end)`.mapWith(Number),
          latestCreatedAt: sql<Date | null>`max(${auditLogs.createdAt})`,
        })
        .from(auditLogs)
        .where(isNotNull(auditLogs.actorUserId))
        .groupBy(auditLogs.actorUserId),
      db
        .select({
          userId: auditLogs.actorUserId,
          action: auditLogs.action,
          total: sql<number>`count(*)`.mapWith(Number),
        })
        .from(auditLogs)
        .where(isNotNull(auditLogs.actorUserId))
        .groupBy(auditLogs.actorUserId, auditLogs.action),
      db
        .select({
          userId: auditLogs.actorUserId,
          entityType: auditLogs.entityType,
          total: sql<number>`count(*)`.mapWith(Number),
        })
        .from(auditLogs)
        .where(isNotNull(auditLogs.actorUserId))
        .groupBy(auditLogs.actorUserId, auditLogs.entityType),
      db
        .select({
          id: auditLogs.id,
          orgId: auditLogs.orgId,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          createdAt: auditLogs.createdAt,
          actorUserId: auditLogs.actorUserId,
          actorEmail: users.email,
          actorName: users.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorUserId, users.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(200),
      queryModuleUserCounts(),
      queryOrgPageTotals(),
    ]);

  const orgNameById = new Map<string, string>();
  orgRows.forEach((org) => orgNameById.set(String(org.id), String(org.name)));

  const usersById = new Map<
    string,
    MasterAdminInsightData['users'][number] & { _membershipIds: Set<string> }
  >();

  for (const row of membershipRows) {
    const userId = String(row.userId);
    const existing =
      usersById.get(userId) ??
      ({
        id: userId,
        email: String(row.userEmail ?? ''),
        name: row.userName ?? null,
        status: String(row.userStatus ?? 'active'),
        createdAt: (row.userCreatedAt as Date | null) ?? null,
        updatedAt: (row.userUpdatedAt as Date | null) ?? null,
        lastLoginAt: (row.userLastLoginAt as Date | null) ?? null,
        memberships: [],
        sessions: {
          total: 0,
          active: 0,
          revoked: 0,
          lastSeenAt: null,
          lastSessionCreatedAt: null,
          latestExpiryAt: null,
        },
        security: {
          passwordResetRequests: 0,
          passwordResetUsed: 0,
          lastPasswordResetAt: null,
        },
        activity: {
          auditEventsTotal: 0,
          auditEvents7d: 0,
          auditEvents30d: 0,
          lastAuditEventAt: null,
          topActions: [],
          topEntities: [],
        },
        moduleContributions: [],
        orgInsights: [],
        _membershipIds: new Set<string>(),
      } as MasterAdminInsightData['users'][number] & { _membershipIds: Set<string> });

    if (!usersById.has(userId)) {
      usersById.set(userId, existing);
    }

    if (row.membershipId) {
      const membershipId = String(row.membershipId);
      if (!existing._membershipIds.has(membershipId)) {
        existing._membershipIds.add(membershipId);
        existing.memberships.push({
          membershipId,
          orgId: String(row.orgId ?? ''),
          orgName: String(row.orgName ?? orgNameById.get(String(row.orgId ?? '')) ?? 'Unknown org'),
          roleId: row.roleId ? String(row.roleId) : null,
          roleKey: row.roleKey ? String(row.roleKey) : null,
          roleName: row.roleName ? String(row.roleName) : null,
          status: String(row.membershipStatus ?? 'active'),
          crewMemberId: row.membershipCrewMemberId ? String(row.membershipCrewMemberId) : null,
          createdAt: (row.membershipCreatedAt as Date | null) ?? null,
        });
      }
    }
  }

  const sessionByUser = new Map<string, (typeof sessionRows)[number]>();
  sessionRows.forEach((row) => sessionByUser.set(String(row.userId), row));

  const passwordResetByUser = new Map<string, (typeof passwordResetRows)[number]>();
  passwordResetRows.forEach((row) => passwordResetByUser.set(String(row.userId), row));

  const auditSummaryByUser = new Map<string, (typeof auditSummaryRows)[number]>();
  auditSummaryRows.forEach((row) => {
    if (row.userId) auditSummaryByUser.set(String(row.userId), row);
  });

  const actionByUser = new Map<string, Map<string, number>>();
  auditActionRows.forEach((row) => {
    if (!row.userId) return;
    const userId = String(row.userId);
    const action = String(row.action);
    if (!actionByUser.has(userId)) actionByUser.set(userId, new Map<string, number>());
    const map = actionByUser.get(userId)!;
    map.set(action, (map.get(action) ?? 0) + Number(row.total ?? 0));
  });

  const entityByUser = new Map<string, Map<string, number>>();
  auditEntityRows.forEach((row) => {
    if (!row.userId) return;
    const userId = String(row.userId);
    const entity = String(row.entityType);
    if (!entityByUser.has(userId)) entityByUser.set(userId, new Map<string, number>());
    const map = entityByUser.get(userId)!;
    map.set(entity, (map.get(entity) ?? 0) + Number(row.total ?? 0));
  });

  const moduleByUser = new Map<
    string,
    Map<string, ModuleAggregate>
  >();
  const userOwnedByOrgPage = new Map<string, Map<string, Map<string, number>>>();

  moduleRows.forEach((row) => {
    if (!usersById.has(row.userId)) return;
    if (!moduleByUser.has(row.userId)) moduleByUser.set(row.userId, new Map());

    const userModules = moduleByUser.get(row.userId)!;
    const existing =
      userModules.get(row.moduleKey) ??
      {
        key: row.moduleKey,
        pageKey: row.pageKey,
        table: row.table,
        linkageLabel: row.linkageLabel,
        total: 0,
        byOrg: new Map<string, number>(),
      };
    existing.total += row.total;
    existing.byOrg.set(row.orgId, (existing.byOrg.get(row.orgId) ?? 0) + row.total);
    userModules.set(row.moduleKey, existing);

    if (!userOwnedByOrgPage.has(row.userId)) userOwnedByOrgPage.set(row.userId, new Map());
    const byOrg = userOwnedByOrgPage.get(row.userId)!;
    if (!byOrg.has(row.orgId)) byOrg.set(row.orgId, new Map());
    const byPage = byOrg.get(row.orgId)!;
    byPage.set(row.pageKey, (byPage.get(row.pageKey) ?? 0) + row.total);
  });

  const orgPageTotals = new Map<string, Map<string, number>>();
  orgPageRows.forEach((row) => {
    if (!orgPageTotals.has(row.orgId)) orgPageTotals.set(row.orgId, new Map());
    const totals = orgPageTotals.get(row.orgId)!;
    totals.set(row.pageKey, (totals.get(row.pageKey) ?? 0) + row.total);
  });

  const usersList = Array.from(usersById.values()).map((user) => {
    const session = sessionByUser.get(user.id);
    if (session) {
      user.sessions = {
        total: Number(session.totalSessions ?? 0),
        active: Number(session.activeSessions ?? 0),
        revoked: Number(session.revokedSessions ?? 0),
        lastSeenAt: (session.lastSeenAt as Date | null) ?? null,
        lastSessionCreatedAt: (session.lastSessionCreatedAt as Date | null) ?? null,
        latestExpiryAt: (session.latestExpiryAt as Date | null) ?? null,
      };
    }

    const resets = passwordResetByUser.get(user.id);
    if (resets) {
      user.security = {
        passwordResetRequests: Number(resets.total ?? 0),
        passwordResetUsed: Number(resets.used ?? 0),
        lastPasswordResetAt: (resets.latestCreatedAt as Date | null) ?? null,
      };
    }

    const audit = auditSummaryByUser.get(user.id);
    if (audit) {
      user.activity.auditEventsTotal = Number(audit.total ?? 0);
      user.activity.auditEvents7d = Number(audit.events7d ?? 0);
      user.activity.auditEvents30d = Number(audit.events30d ?? 0);
      user.activity.lastAuditEventAt = (audit.latestCreatedAt as Date | null) ?? null;
    }

    const actionMap = actionByUser.get(user.id) ?? new Map<string, number>();
    user.activity.topActions = Array.from(actionMap.entries())
      .map(([action, total]) => ({ action, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const entityMap = entityByUser.get(user.id) ?? new Map<string, number>();
    user.activity.topEntities = Array.from(entityMap.entries())
      .map(([entityType, total]) => ({ entityType, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const moduleMap = moduleByUser.get(user.id) ?? new Map<string, ModuleAggregate>();
    user.moduleContributions = Array.from(moduleMap.values())
      .map((entry) => {
        const page = PAGE_META[entry.pageKey] ?? { key: entry.pageKey, label: entry.pageKey, route: '/' };
        return {
          key: entry.key,
          pageKey: entry.pageKey,
          pageLabel: page.label,
          route: page.route,
          table: entry.table,
          linkageLabel: entry.linkageLabel,
          total: entry.total,
          byOrg: Array.from(entry.byOrg.entries())
            .map(([orgId, total]) => ({
              orgId,
              orgName: orgNameById.get(orgId) ?? 'Unknown org',
              total,
            }))
            .sort((a, b) => b.total - a.total),
        };
      })
      .sort((a, b) => b.total - a.total);

    const memberOrgIds = user.memberships.map((membership) => membership.orgId).filter(Boolean);
    const contributedOrgIds = Array.from(userOwnedByOrgPage.get(user.id)?.keys() ?? []);
    const combinedOrgIds = Array.from(new Set([...memberOrgIds, ...contributedOrgIds]));
    user.orgInsights = combinedOrgIds
      .map((orgId) => {
        const orgTotals = orgPageTotals.get(orgId) ?? new Map<string, number>();
        const userOwned = userOwnedByOrgPage.get(user.id)?.get(orgId) ?? new Map<string, number>();
        const orgName = orgNameById.get(orgId) ?? 'Unknown org';

        const pageKeys = Array.from(
          new Set([
            ...Array.from(orgTotals.keys()),
            ...Array.from(userOwned.keys()),
          ])
        );

        const pageTotals = pageKeys
          .map((pageKey) => {
            const page = PAGE_META[pageKey] ?? { key: pageKey, label: pageKey, route: '/' };
            return {
              pageKey,
              pageLabel: page.label,
              route: page.route,
              total: orgTotals.get(pageKey) ?? 0,
            };
          })
          .sort((a, b) => b.total - a.total);

        const userOwnedTotals = pageKeys
          .map((pageKey) => {
            const page = PAGE_META[pageKey] ?? { key: pageKey, label: pageKey, route: '/' };
            return {
              pageKey,
              pageLabel: page.label,
              route: page.route,
              total: userOwned.get(pageKey) ?? 0,
            };
          })
          .filter((entry) => entry.total > 0)
          .sort((a, b) => b.total - a.total);

        return {
          orgId,
          orgName,
          pageTotals,
          userOwnedTotals,
        };
      })
      .sort((a, b) => a.orgName.localeCompare(b.orgName));

    delete (user as MasterAdminInsightData['users'][number] & { _membershipIds?: Set<string> })._membershipIds;
    return user;
  });

  const usersTotal = usersList.length;
  const usersActive = usersList.filter((user) => user.status === 'active').length;
  const usersInvited = usersList.filter((user) => user.status === 'invited').length;
  const usersDisabled = usersList.filter((user) => user.status === 'disabled').length;
  const usersLoggedIn7d = usersList.filter(
    (user) => user.lastLoginAt && new Date(user.lastLoginAt).getTime() >= start7.getTime()
  ).length;

  const orgPageTotalsList = Array.from(orgPageTotals.entries())
    .map(([orgId, totalsMap]) => {
      const orgName = orgNameById.get(orgId) ?? 'Unknown org';
      const totals = Array.from(totalsMap.entries())
        .map(([pageKey, total]) => {
          const page = PAGE_META[pageKey] ?? { key: pageKey, label: pageKey, route: '/' };
          return {
            pageKey,
            pageLabel: page.label,
            route: page.route,
            total,
          };
        })
        .sort((a, b) => b.total - a.total);
      return { orgId, orgName, totals };
    })
    .sort((a, b) => a.orgName.localeCompare(b.orgName));

  return {
    generatedAt: now,
    summary: {
      usersTotal,
      usersActive,
      usersInvited,
      usersDisabled,
      usersLoggedIn7d,
      orgsTotal: orgRows.length,
    },
    orgs: orgRows.map((org) => ({ id: String(org.id), name: String(org.name) })),
    orgPageTotals: orgPageTotalsList,
    users: usersList.sort((a, b) => a.email.localeCompare(b.email)),
    recentAuditEvents: recentAuditRows.map((row) => ({
      id: String(row.id),
      orgId: String(row.orgId),
      orgName: orgNameById.get(String(row.orgId)) ?? 'Unknown org',
      actorUserId: row.actorUserId ? String(row.actorUserId) : null,
      actorEmail: row.actorEmail ? String(row.actorEmail) : null,
      actorName: row.actorName ? String(row.actorName) : null,
      action: String(row.action),
      entityType: String(row.entityType),
      entityId: row.entityId ? String(row.entityId) : null,
      createdAt: (row.createdAt as Date | null) ?? null,
    })),
  };
}
