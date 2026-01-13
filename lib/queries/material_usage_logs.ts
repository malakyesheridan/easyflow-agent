import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { materials } from '@/db/schema/materials';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';

export type MaterialUsageLogWithMaterial = {
  id: string;
  orgId: string;
  materialId: string;
  jobId: string;
  taskId: string | null;
  quantityUsed: any;
  unitCostCents: number | null;
  notes: string | null;
  loggedByCrewMemberId: string | null;
  createdAt: Date;
  materialName: string;
  materialUnit: string;
};

export async function listMaterialUsageLogs(params: {
  orgId: string;
  jobId?: string;
  materialId?: string;
  limit?: number;
  actor?: RequestActor;
}): Promise<Result<MaterialUsageLogWithMaterial[]>> {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(200, params.limit ?? 50));

    const baseWhere = params.jobId
      ? and(eq(materialUsageLogs.orgId, params.orgId), eq(materialUsageLogs.jobId, params.jobId))
      : params.materialId
        ? and(eq(materialUsageLogs.orgId, params.orgId), eq(materialUsageLogs.materialId, params.materialId))
        : eq(materialUsageLogs.orgId, params.orgId);
    const jobVisibility = params.actor ? applyJobVisibility(eq(jobs.orgId, params.orgId), params.actor, jobs) : null;
    const where = jobVisibility ? and(baseWhere, jobVisibility) : baseWhere;

    const rows = await db
      .select({
        id: materialUsageLogs.id,
        orgId: materialUsageLogs.orgId,
        materialId: materialUsageLogs.materialId,
        jobId: materialUsageLogs.jobId,
        taskId: materialUsageLogs.taskId,
        quantityUsed: materialUsageLogs.quantityUsed,
        unitCostCents: materialUsageLogs.unitCostCents,
        notes: materialUsageLogs.notes,
        loggedByCrewMemberId: materialUsageLogs.loggedByCrewMemberId,
        createdAt: materialUsageLogs.createdAt,
        materialName: materials.name,
        materialUnit: materials.unit,
      })
      .from(materialUsageLogs)
      .leftJoin(jobs, eq(jobs.id, materialUsageLogs.jobId))
      .innerJoin(materials, and(eq(materials.id, materialUsageLogs.materialId), eq(materials.orgId, materialUsageLogs.orgId)))
      .where(where)
      .orderBy(desc(materialUsageLogs.createdAt))
      .limit(limit);

    return ok(rows as unknown as MaterialUsageLogWithMaterial[]);
  } catch (error) {
    console.error('Error listing material usage logs:', error);
    return err('INTERNAL_ERROR', 'Failed to list usage logs', error);
  }
}
