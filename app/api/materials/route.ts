import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { canManageWarehouse } from '@/lib/authz';
import { listMaterialsWithStats } from '@/lib/queries/materials';
import { createMaterial, deleteMaterial, updateMaterial } from '@/lib/mutations/materials';
import { requireOrgContext } from '@/lib/auth/require';
import { getMaterialById } from '@/lib/queries/materials';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

/**
 * GET /api/materials?orgId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageWarehouse(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await listMaterialsWithStats(context.data.orgId);
});

/**
 * POST /api/materials
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageWarehouse(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const result = await createMaterial({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'CREATE',
      entityType: 'material',
      entityId: result.data.id,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
  }
  return result;
});

/**
 * PATCH /api/materials
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageWarehouse(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const before = body?.id ? await getMaterialById({ orgId: context.data.orgId, id: String(body.id) }) : null;
  const result = await updateMaterial({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'UPDATE',
      entityType: 'material',
      entityId: result.data.id,
      before: before?.ok ? before.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
  }
  return result;
});

/**
 * DELETE /api/materials?id=...&orgId=...
 */
export const DELETE = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const id = searchParams.get('id');
  if (!id) return err('VALIDATION_ERROR', 'id query parameter is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageWarehouse(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const before = await getMaterialById({ orgId: context.data.orgId, id });
  const result = await deleteMaterial({ orgId: context.data.orgId, id });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'DELETE',
      entityType: 'material',
      entityId: id,
      before: before.ok ? before.data : null,
      after: null,
      metadata: buildAuditMetadata(req),
    });
  }
  return result;
});
