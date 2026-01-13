import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { canManageWarehouse } from '@/lib/authz';
import { listMaterialInventoryEvents } from '@/lib/queries/material_inventory_events';
import { createMaterialInventoryEvent } from '@/lib/mutations/material_inventory_events';
import { materialInventoryEventListSchema } from '@/lib/validators/material_inventory_events';
import { requireOrgContext } from '@/lib/auth/require';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { toNumber } from '@/lib/utils/quantity';
import { getMaterialStockTotal } from '@/lib/queries/material_inventory_events';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

/**
 * GET /api/material-inventory-events?orgId=...&materialId=...&limit=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const validated = materialInventoryEventListSchema.parse({
    orgId: context.data.orgId,
    materialId: searchParams.get('materialId') || undefined,
    jobId: searchParams.get('jobId') || undefined,
    limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
  });

  return await listMaterialInventoryEvents(validated);
});

/**
 * POST /api/material-inventory-events
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageWarehouse(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const beforeStock = body?.materialId
    ? await getMaterialStockTotal({ orgId: context.data.orgId, materialId: String(body.materialId) })
    : null;
  const result = await createMaterialInventoryEvent({ ...body, orgId: context.data.orgId, actorCrewMemberId: actor.crewMemberId });
  if (result.ok) {
    const previous = beforeStock?.ok ? beforeStock.data : null;
    const delta = toNumber(result.data.quantity);
    const nextStock = previous !== null ? previous + delta : null;
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'STOCK_CHANGE',
      entityType: 'material',
      entityId: result.data.materialId,
      before: previous === null ? null : { stock: previous },
      after: nextStock === null ? { event: result.data } : { stock: nextStock, event: result.data },
      metadata: buildAuditMetadata(req, {
        materialId: result.data.materialId,
        eventType: result.data.eventType,
        quantity: delta,
      }),
    });
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'material.stock.updated',
      payload: {
        materialId: result.data.materialId,
        jobId: result.data.jobId ?? undefined,
        quantity: toNumber(result.data.quantity),
      },
      actorUserId: actor.userId,
    });
  }
  return result;
});
