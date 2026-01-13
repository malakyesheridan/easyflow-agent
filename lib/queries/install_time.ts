import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { materials } from '@/db/schema/materials';
import { ok, err, type Result } from '@/lib/result';
import { isSquareMeterUnit } from '@/lib/utils/installTime';
import { toNumber } from '@/lib/utils/quantity';

export type JobM2Totals = {
  plannedM2: number;
  usedM2: number;
};

export async function getJobM2Totals(params: { orgId: string; jobId: string }): Promise<Result<JobM2Totals>> {
  try {
    const db = getDb();

    const plannedRows = await db
      .select({
        quantity: jobMaterialAllocations.plannedQuantity,
        unit: materials.unit,
      })
      .from(jobMaterialAllocations)
      .innerJoin(
        materials,
        and(eq(materials.id, jobMaterialAllocations.materialId), eq(materials.orgId, jobMaterialAllocations.orgId))
      )
      .where(and(eq(jobMaterialAllocations.orgId, params.orgId), eq(jobMaterialAllocations.jobId, params.jobId)));

    const usageRows = await db
      .select({
        quantity: materialUsageLogs.quantityUsed,
        unit: materials.unit,
      })
      .from(materialUsageLogs)
      .innerJoin(materials, and(eq(materials.id, materialUsageLogs.materialId), eq(materials.orgId, materialUsageLogs.orgId)))
      .where(and(eq(materialUsageLogs.orgId, params.orgId), eq(materialUsageLogs.jobId, params.jobId)));

    const plannedM2 = plannedRows.reduce((sum, row) => {
      if (!isSquareMeterUnit(row.unit)) return sum;
      return sum + toNumber(row.quantity);
    }, 0);

    const usedM2 = usageRows.reduce((sum, row) => {
      if (!isSquareMeterUnit(row.unit)) return sum;
      return sum + toNumber(row.quantity);
    }, 0);

    return ok({ plannedM2, usedM2 });
  } catch (error) {
    console.error('Error fetching job m2 totals:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job material totals', error);
  }
}
