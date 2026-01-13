import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materialInventoryEvents } from '@/db/schema/material_inventory_events';
import { ok, err, type Result } from '@/lib/result';

export async function listMaterialInventoryEvents(params: {
  orgId: string;
  materialId?: string;
  jobId?: string;
  limit?: number;
}): Promise<Result<any[]>> {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(200, params.limit ?? 50));

    const where = params.materialId
      ? and(eq(materialInventoryEvents.orgId, params.orgId), eq(materialInventoryEvents.materialId, params.materialId))
      : params.jobId
        ? and(eq(materialInventoryEvents.orgId, params.orgId), eq(materialInventoryEvents.jobId, params.jobId))
        : eq(materialInventoryEvents.orgId, params.orgId);

    const rows = await db
      .select()
      .from(materialInventoryEvents)
      .where(where)
      .orderBy(desc(materialInventoryEvents.createdAt))
      .limit(limit);

    return ok(rows);
  } catch (error) {
    console.error('Error listing inventory events:', error);
    return err('INTERNAL_ERROR', 'Failed to list inventory events', error);
  }
}

export async function getMaterialStockTotal(params: {
  orgId: string;
  materialId: string;
}): Promise<Result<number>> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        total: sql<number>`coalesce(sum(${materialInventoryEvents.quantity}), 0)`.mapWith(Number),
      })
      .from(materialInventoryEvents)
      .where(
        and(
          eq(materialInventoryEvents.orgId, params.orgId),
          eq(materialInventoryEvents.materialId, params.materialId)
        )
      );

    return ok(Number(row?.total ?? 0));
  } catch (error) {
    console.error('Error computing material stock total:', error);
    return err('INTERNAL_ERROR', 'Failed to compute stock total', error);
  }
}
