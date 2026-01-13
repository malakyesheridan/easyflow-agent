import { createHash } from 'crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materialAlerts } from '@/db/schema/material_alerts';
import { materials } from '@/db/schema/materials';
import { materialInventoryEvents } from '@/db/schema/material_inventory_events';
import { toNumber } from '@/lib/utils/quantity';
import { getReservedForMaterial } from '@/lib/queries/material_reservations';
import { emitCommEvent } from '@/lib/communications/emit';

function makeEventKey(params: { type: string; materialId: string; jobId?: string | null }) {
  return `material_alert:${params.type}:${params.materialId}:${params.jobId ?? 'none'}`;
}

function hashToUuid(input: string): string {
  const hex = createHash('sha256').update(input).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function computeAvailability(db: ReturnType<typeof getDb>, orgId: string, materialId: string) {
  const [stockRow] = await db
    .select({ stock: sql<number>`coalesce(sum(${materialInventoryEvents.quantity}), 0)`.mapWith(Number) })
    .from(materialInventoryEvents)
    .where(and(eq(materialInventoryEvents.orgId, orgId), eq(materialInventoryEvents.materialId, materialId)));

  const stock = toNumber(stockRow?.stock ?? 0);
  const reservedResult = await getReservedForMaterial({ orgId, materialId });
  const allocated = reservedResult.ok ? reservedResult.data : 0;
  return { stock, allocated, available: stock - allocated };
}

async function upsertAlert(params: {
  orgId: string;
  materialId: string;
  jobId?: string | null;
  type: 'low_stock' | 'insufficient_for_job';
  message: string;
}): Promise<boolean> {
  const db = getDb();
  const eventKey = makeEventKey({ type: params.type, materialId: params.materialId, jobId: params.jobId });

  const triggered = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(materialAlerts)
      .where(and(eq(materialAlerts.orgId, params.orgId), eq(materialAlerts.eventKey, eventKey)))
      .limit(1);

    const now = new Date();
    let fired = false;

    if (!existing) {
      await tx.insert(materialAlerts).values({
        orgId: params.orgId,
        type: params.type,
        materialId: params.materialId,
        jobId: params.jobId ?? null,
        message: params.message,
        eventKey,
        createdAt: now,
        resolvedAt: null,
      } as any);

      fired = true;
      return fired;
    }

    if (existing.resolvedAt) {
      await tx
        .update(materialAlerts)
        .set({ resolvedAt: null, createdAt: now, message: params.message } as any)
        .where(and(eq(materialAlerts.id, existing.id), eq(materialAlerts.orgId, params.orgId)));
      fired = true;
      return fired;
    }

    if (existing.message !== params.message) {
      await tx
        .update(materialAlerts)
        .set({ message: params.message } as any)
        .where(and(eq(materialAlerts.id, existing.id), eq(materialAlerts.orgId, params.orgId)));
      fired = false;
      return fired;
    }

    return fired;
  });

  if (triggered) {
    const entityId = hashToUuid(`${eventKey}:${new Date().toISOString()}`);
    void emitCommEvent({
      orgId: params.orgId,
      eventKey: 'material_alert',
      entityType: 'material',
      entityId,
      triggeredByUserId: null,
      payload: {
        alert: {
          type: params.type,
          message: params.message,
        },
        materialId: params.materialId,
        jobId: params.jobId ?? null,
      },
    });
  }

  return Boolean(triggered);
}

async function resolveAlert(params: { orgId: string; eventKey: string }) {
  const db = getDb();
  await db
    .update(materialAlerts)
    .set({ resolvedAt: new Date() } as any)
    .where(and(eq(materialAlerts.orgId, params.orgId), eq(materialAlerts.eventKey, params.eventKey), isNull(materialAlerts.resolvedAt)));
}

export async function recomputeMaterialAlertsBestEffort(params: { orgId: string; materialId: string; jobId?: string }) {
  try {
    const db = getDb();
    const [mat] = await db
      .select({ id: materials.id, name: materials.name, unit: materials.unit, reorderThreshold: materials.reorderThreshold })
      .from(materials)
      .where(and(eq(materials.orgId, params.orgId), eq(materials.id, params.materialId)))
      .limit(1);

    if (!mat) return;

    const { available } = await computeAvailability(db, params.orgId, params.materialId);
    const threshold = mat.reorderThreshold == null ? null : toNumber(mat.reorderThreshold);

    const lowStockKey = makeEventKey({ type: 'low_stock', materialId: params.materialId, jobId: null });
    if (threshold !== null && available < threshold) {
      const triggered = await upsertAlert({
        orgId: params.orgId,
        materialId: params.materialId,
        type: 'low_stock',
        message: `${mat.name} is below its reorder threshold. Available: ${available.toFixed(2)} ${mat.unit}`,
      });
      if (triggered) {
        const { emitAppEvent } = await import('@/lib/integrations/events/emit');
        void emitAppEvent({
          orgId: params.orgId,
          eventType: 'material.stock.low',
          payload: {
            materialId: params.materialId,
            quantity: available,
          },
        });
      }
    } else {
      await resolveAlert({ orgId: params.orgId, eventKey: lowStockKey });
    }

    if (params.jobId) {
      const insufficientKey = makeEventKey({ type: 'insufficient_for_job', materialId: params.materialId, jobId: params.jobId });
      if (available < 0) {
        await upsertAlert({
          orgId: params.orgId,
          materialId: params.materialId,
          jobId: params.jobId,
          type: 'insufficient_for_job',
          message: `Insufficient available ${mat.name} to cover planned allocations. Shortfall: ${Math.abs(available).toFixed(2)} ${mat.unit}`,
        });
      } else {
        await resolveAlert({ orgId: params.orgId, eventKey: insufficientKey });
      }
    }
  } catch (error) {
    console.error('Error recomputing material alerts:', error);
  }
}
