import { and, inArray, sql, type SQL } from 'drizzle-orm';
import { jobs } from '@/db/schema/jobs';
import { err, ok, type Result } from '@/lib/result';

export type RequestActor = {
  userId: string | null;
  orgId: string | null;
  crewMemberId: string | null;
  roleKey: string | null;
  capabilities: string[];
  isImpersonating: boolean;
};

export type VisibilityMode = 'orgWide' | 'crewScoped';

const ORG_WIDE_VISIBILITY_CAPABILITIES = new Set([
  'admin',
  'manage_org',
  'manage_roles',
  'manage_staff',
  'manage_schedule',
  'manage_jobs',
]);

function hasCapability(actor: RequestActor, capability: string): boolean {
  if (!actor.userId) return false;
  if (actor.capabilities.includes('admin')) return true;
  return actor.capabilities.includes(capability);
}

export function getVisibilityMode(actor: RequestActor): VisibilityMode {
  if (!actor.userId) return 'crewScoped';
  for (const capability of ORG_WIDE_VISIBILITY_CAPABILITIES) {
    if (actor.capabilities.includes(capability)) return 'orgWide';
  }
  return 'crewScoped';
}

export function getCrewIdsForActor(actor: RequestActor): string[] {
  if (!actor.userId) return [];
  const crewId = actor.crewMemberId?.trim();
  return crewId ? [crewId] : [];
}

export function applyJobVisibility<T extends { crewId: string | null }>(
  rows: T[],
  actor: RequestActor
): T[];
export function applyJobVisibility(
  where: SQL | undefined,
  actor: RequestActor,
  jobTable?: typeof jobs
): SQL;
export function applyJobVisibility(
  query: SQL | undefined | Array<{ crewId: string | null }>,
  actor: RequestActor,
  jobTable: typeof jobs = jobs
): SQL | Array<{ crewId: string | null }> {
  const visibilityMode = getVisibilityMode(actor);
  if (Array.isArray(query)) {
    if (visibilityMode === 'orgWide') return query;
    const crewIds = getCrewIdsForActor(actor);
    if (crewIds.length === 0) return [];
    return query.filter((row) => row.crewId !== null && crewIds.includes(row.crewId));
  }

  if (visibilityMode === 'orgWide') return query ?? sql`true`;
  const crewIds = getCrewIdsForActor(actor);
  if (crewIds.length === 0) {
    return sql`false`;
  }
  const visibilityCondition = inArray(jobTable.crewId, crewIds);
  if (!query) return visibilityCondition;
  const combined = and(query, visibilityCondition);
  return combined ?? visibilityCondition;
}

export function assertJobWriteAccess(
  job: { crewId: string | null },
  actor: RequestActor
): Result<true> {
  if (getVisibilityMode(actor) === 'orgWide') {
    return ok(true);
  }
  const crewIds = getCrewIdsForActor(actor);
  if (job.crewId && crewIds.includes(job.crewId)) {
    return ok(true);
  }
  return err('FORBIDDEN', 'Insufficient permissions');
}

export function canManageContacts(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_jobs') || hasCapability(actor, 'manage_staff');
}

export function canWriteJobArtifacts(actor: RequestActor): boolean {
  return canUpdateJobs(actor);
}

export function canManageWarehouse(actor: RequestActor): boolean {
  return canManageJobs(actor) || canManageSchedule(actor);
}

export function canLogMaterialUsage(actor: RequestActor): boolean {
  return canManageWarehouse(actor);
}

export function canManageOrgSettings(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_org');
}

export function canManageAnnouncements(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_announcements');
}

export function canManageTemplates(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_templates');
}

export function canManageStaff(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_staff');
}

export function canManageSchedule(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_schedule');
}

export function canManageJobs(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_jobs');
}

export function canManageClients(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_jobs') || hasCapability(actor, 'manage_org');
}

export function canUpdateJobs(actor: RequestActor): boolean {
  return hasCapability(actor, 'update_jobs') || hasCapability(actor, 'manage_jobs');
}

export function canViewJobs(actor: RequestActor): boolean {
  return (
    hasCapability(actor, 'view_jobs') ||
    hasCapability(actor, 'update_jobs') ||
    hasCapability(actor, 'manage_jobs')
  );
}

export function canViewSchedule(actor: RequestActor): boolean {
  return hasCapability(actor, 'view_schedule') || hasCapability(actor, 'manage_schedule');
}

export function canViewOperations(actor: RequestActor): boolean {
  return canViewSchedule(actor) || canViewJobs(actor);
}

export function canManageOperations(actor: RequestActor): boolean {
  return canManageSchedule(actor) || canManageJobs(actor);
}

export function canViewAuditLogs(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_org');
}

export function canImpersonate(actor: RequestActor): boolean {
  return hasCapability(actor, 'manage_staff');
}

export function isOrgAdmin(actor: RequestActor): boolean {
  if (!actor.userId) return false;
  return actor.capabilities.includes('admin');
}
