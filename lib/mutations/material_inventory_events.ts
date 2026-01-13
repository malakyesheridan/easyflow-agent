import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materialInventoryEvents } from '@/db/schema/material_inventory_events';
import { ok, err, type Result } from '@/lib/result';
import type { MaterialInventoryEvent, NewMaterialInventoryEvent } from '@/db/schema/material_inventory_events';
import { materialInventoryEventCreateSchema, type CreateMaterialInventoryEventInput } from '@/lib/validators/material_inventory_events';
import { toNumericString } from '@/lib/utils/quantity';
import { recomputeMaterialAlertsBestEffort } from '@/lib/mutations/material_alerts';

export async function createMaterialInventoryEvent(
  input: CreateMaterialInventoryEventInput & { actorCrewMemberId?: string | null }
): Promise<Result<MaterialInventoryEvent>> {
  try {
    const validated = materialInventoryEventCreateSchema.parse(input);
    const db = getDb();

    const values: NewMaterialInventoryEvent = {
      orgId: validated.orgId,
      materialId: validated.materialId,
      eventType: validated.eventType,
      quantity: toNumericString(validated.quantity) as any,
      reason: validated.reason?.trim() || null,
      jobId: validated.jobId || null,
      usageLogId: null,
      actorCrewMemberId: input.actorCrewMemberId ?? null,
      createdAt: new Date(),
    } as any;

    const [row] = await db.insert(materialInventoryEvents).values(values).returning();
    void recomputeMaterialAlertsBestEffort({ orgId: validated.orgId, materialId: validated.materialId });
    return ok(row);
  } catch (error) {
    console.error('Error creating inventory event:', error);
    return err('INTERNAL_ERROR', 'Failed to create inventory event', error);
  }
}

