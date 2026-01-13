import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { materials } from '@/db/schema/materials';
import { ok, err, type Result } from '@/lib/result';
import type { JobMaterialAllocation, NewJobMaterialAllocation } from '@/db/schema/job_material_allocations';
import {
  jobMaterialAllocationCreateSchema,
  jobMaterialAllocationDeleteSchema,
  jobMaterialAllocationUpdateSchema,
  type CreateJobMaterialAllocationInput,
  type UpdateJobMaterialAllocationInput,
} from '@/lib/validators/job_material_allocations';
import { toNumericString } from '@/lib/utils/quantity';
import { recomputeMaterialAlertsBestEffort } from '@/lib/mutations/material_alerts';

export async function createJobMaterialAllocation(input: CreateJobMaterialAllocationInput): Promise<Result<JobMaterialAllocation>> {
  try {
    const validated = jobMaterialAllocationCreateSchema.parse(input);
    const db = getDb();

    let unitCostCents: number | null = validated.unitCostCents ?? null;
    if (unitCostCents === null) {
      const [materialRow] = await db
        .select({ unitCostCents: materials.unitCostCents })
        .from(materials)
        .where(and(eq(materials.orgId, validated.orgId), eq(materials.id, validated.materialId)))
        .limit(1);
      unitCostCents = materialRow?.unitCostCents ?? null;
    }

    const values: NewJobMaterialAllocation = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      materialId: validated.materialId,
      plannedQuantity: toNumericString(validated.plannedQuantity) as any,
      unitCostCents,
      notes: validated.notes?.trim() || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const [row] = await db.insert(jobMaterialAllocations).values(values).returning();
    void recomputeMaterialAlertsBestEffort({ orgId: validated.orgId, materialId: validated.materialId, jobId: validated.jobId });
    return ok(row);
  } catch (error) {
    console.error('Error creating job material allocation:', error);
    return err('INTERNAL_ERROR', 'Failed to allocate material', error);
  }
}

export async function updateJobMaterialAllocation(input: UpdateJobMaterialAllocationInput): Promise<Result<JobMaterialAllocation>> {
  try {
    const validated = jobMaterialAllocationUpdateSchema.parse(input);
    const db = getDb();

    const updateData: Partial<NewJobMaterialAllocation> = { updatedAt: new Date() };
    if (validated.plannedQuantity !== undefined) updateData.plannedQuantity = toNumericString(validated.plannedQuantity) as any;
    if (validated.unitCostCents !== undefined) updateData.unitCostCents = validated.unitCostCents;
    if (validated.notes !== undefined) updateData.notes = validated.notes?.trim() || null;

    const [row] = await db
      .update(jobMaterialAllocations)
      .set(updateData as any)
      .where(and(eq(jobMaterialAllocations.id, validated.id), eq(jobMaterialAllocations.orgId, validated.orgId)))
      .returning();
    if (!row) return err('NOT_FOUND', 'Allocation not found');

    void recomputeMaterialAlertsBestEffort({ orgId: validated.orgId, materialId: row.materialId, jobId: row.jobId });
    return ok(row);
  } catch (error) {
    console.error('Error updating job material allocation:', error);
    return err('INTERNAL_ERROR', 'Failed to update allocation', error);
  }
}

export async function deleteJobMaterialAllocation(params: { id: string; orgId: string }): Promise<Result<JobMaterialAllocation | null>> {
  try {
    const validated = jobMaterialAllocationDeleteSchema.parse(params);
    const db = getDb();
    const [row] = await db
      .delete(jobMaterialAllocations)
      .where(and(eq(jobMaterialAllocations.id, validated.id), eq(jobMaterialAllocations.orgId, validated.orgId)))
      .returning();
    if (row) void recomputeMaterialAlertsBestEffort({ orgId: validated.orgId, materialId: row.materialId, jobId: row.jobId });
    return ok(row ?? null);
  } catch (error) {
    console.error('Error deleting job material allocation:', error);
    return err('INTERNAL_ERROR', 'Failed to delete allocation', error);
  }
}
