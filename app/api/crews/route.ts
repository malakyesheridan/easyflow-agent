import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listCrewMembers } from '@/lib/queries/crew_members';
import { createCrewMember, updateCrewMember } from '@/lib/mutations/crew_members';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageStaff } from '@/lib/authz';
import { getCrewMemberById } from '@/lib/queries/crew_members';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

/**
 * GET /api/crews
 * Query:
 * - orgId (required)
 * - activeOnly (optional): 'true' | 'false'
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const activeOnly = searchParams.get('activeOnly') === 'true';
  return await listCrewMembers({ orgId: context.data.orgId, activeOnly });
});

/**
 * POST /api/crews
 * Body:
 * - orgId, firstName, lastName, role, active, defaultStartMinutes, defaultEndMinutes, dailyCapacityMinutes
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageStaff(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const result = await createCrewMember({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'CREATE',
      entityType: 'crew_member',
      entityId: result.data.id,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
  }
  return result;
});

/**
 * PATCH /api/crews
 * Body:
 * - id, orgId, and any updatable fields
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageStaff(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const before = await getCrewMemberById({ orgId: context.data.orgId, id: String(body.id) });
  const result = await updateCrewMember({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'UPDATE',
      entityType: 'crew_member',
      entityId: result.data.id,
      before: before.ok ? before.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
  }
  return result;
});
