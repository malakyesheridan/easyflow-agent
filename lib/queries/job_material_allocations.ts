import { and, eq, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { materials } from '@/db/schema/materials';
import { ok, err, type Result } from '@/lib/result';

export type JobMaterialAllocationWithMaterial = {
  id: string;
  orgId: string;
  jobId: string;
  materialId: string;
  plannedQuantity: any;
  notes: string | null;
  unitCostCents: number | null;
  createdAt: Date;
  updatedAt: Date;
  materialName: string;
  materialUnit: string;
  materialCategory: string | null;
};

export async function listJobMaterialAllocations(params: {
  orgId: string;
  jobId: string;
}): Promise<Result<JobMaterialAllocationWithMaterial[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: jobMaterialAllocations.id,
        orgId: jobMaterialAllocations.orgId,
        jobId: jobMaterialAllocations.jobId,
        materialId: jobMaterialAllocations.materialId,
        plannedQuantity: jobMaterialAllocations.plannedQuantity,
        unitCostCents: jobMaterialAllocations.unitCostCents,
        notes: jobMaterialAllocations.notes,
        createdAt: jobMaterialAllocations.createdAt,
        updatedAt: jobMaterialAllocations.updatedAt,
        materialName: materials.name,
        materialUnit: materials.unit,
        materialCategory: materials.category,
      })
      .from(jobMaterialAllocations)
      .innerJoin(
        materials,
        and(eq(materials.id, jobMaterialAllocations.materialId), eq(materials.orgId, jobMaterialAllocations.orgId))
      )
      .where(and(eq(jobMaterialAllocations.orgId, params.orgId), eq(jobMaterialAllocations.jobId, params.jobId)))
      .orderBy(desc(jobMaterialAllocations.updatedAt));

    return ok(rows as unknown as JobMaterialAllocationWithMaterial[]);
  } catch (error) {
    console.error('Error listing job material allocations:', error);
    return err('INTERNAL_ERROR', 'Failed to list planned materials', error);
  }
}

export async function getJobMaterialAllocationById(params: {
  orgId: string;
  id: string;
}): Promise<Result<JobMaterialAllocationWithMaterial>> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        id: jobMaterialAllocations.id,
        orgId: jobMaterialAllocations.orgId,
        jobId: jobMaterialAllocations.jobId,
        materialId: jobMaterialAllocations.materialId,
        plannedQuantity: jobMaterialAllocations.plannedQuantity,
        unitCostCents: jobMaterialAllocations.unitCostCents,
        notes: jobMaterialAllocations.notes,
        createdAt: jobMaterialAllocations.createdAt,
        updatedAt: jobMaterialAllocations.updatedAt,
        materialName: materials.name,
        materialUnit: materials.unit,
        materialCategory: materials.category,
      })
      .from(jobMaterialAllocations)
      .innerJoin(
        materials,
        and(eq(materials.id, jobMaterialAllocations.materialId), eq(materials.orgId, jobMaterialAllocations.orgId))
      )
      .where(and(eq(jobMaterialAllocations.orgId, params.orgId), eq(jobMaterialAllocations.id, params.id)))
      .limit(1);
    if (!row) return err('NOT_FOUND', 'Job material allocation not found');
    return ok(row as JobMaterialAllocationWithMaterial);
  } catch (error) {
    console.error('Error fetching job material allocation:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch planned material', error);
  }
}
