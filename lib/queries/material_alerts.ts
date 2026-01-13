import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materialAlerts } from '@/db/schema/material_alerts';
import { materials } from '@/db/schema/materials';
import { ok, err, type Result } from '@/lib/result';

export type MaterialAlertWithMaterial = {
  id: string;
  orgId: string;
  type: string;
  materialId: string;
  jobId: string | null;
  message: string;
  eventKey: string;
  createdAt: Date;
  resolvedAt: Date | null;
  materialName: string;
  materialUnit: string;
};

export async function listActiveMaterialAlerts(params: { orgId: string; limit?: number }): Promise<Result<MaterialAlertWithMaterial[]>> {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(200, params.limit ?? 50));

    const rows = await db
      .select({
        id: materialAlerts.id,
        orgId: materialAlerts.orgId,
        type: materialAlerts.type,
        materialId: materialAlerts.materialId,
        jobId: materialAlerts.jobId,
        message: materialAlerts.message,
        eventKey: materialAlerts.eventKey,
        createdAt: materialAlerts.createdAt,
        resolvedAt: materialAlerts.resolvedAt,
        materialName: materials.name,
        materialUnit: materials.unit,
      })
      .from(materialAlerts)
      .innerJoin(materials, and(eq(materials.id, materialAlerts.materialId), eq(materials.orgId, materialAlerts.orgId)))
      .where(and(eq(materialAlerts.orgId, params.orgId), isNull(materialAlerts.resolvedAt)))
      .orderBy(desc(materialAlerts.createdAt))
      .limit(limit);

    return ok(rows as unknown as MaterialAlertWithMaterial[]);
  } catch (error) {
    console.error('Error listing material alerts:', error);
    return err('INTERNAL_ERROR', 'Failed to list alerts', error);
  }
}

