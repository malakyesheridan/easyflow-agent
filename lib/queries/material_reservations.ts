import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';

/**
 * Reservation = planned allocations for active jobs minus actual consumed usage (clamped at 0).
 * This prevents double-counting when usage logs also reduce stock via inventory events.
 */
export async function getReservedByMaterial(params: {
  orgId: string;
  materialIds: string[];
}): Promise<Result<Map<string, number>>> {
  try {
    const db = getDb();
    const materialIds = Array.from(new Set(params.materialIds)).filter(Boolean);
    if (materialIds.length === 0) return ok(new Map());

	    const usage = db
	      .select({
	        orgId: materialUsageLogs.orgId,
	        jobId: materialUsageLogs.jobId,
	        materialId: materialUsageLogs.materialId,
	        used: sql<number>`coalesce(sum(${materialUsageLogs.quantityUsed}), 0)`.mapWith(Number).as('used'),
	      })
	      .from(materialUsageLogs)
	      .where(and(eq(materialUsageLogs.orgId, params.orgId), inArray(materialUsageLogs.materialId, materialIds)))
	      .groupBy(materialUsageLogs.orgId, materialUsageLogs.jobId, materialUsageLogs.materialId)
	      .as('usage');

    const rows = await db
      .select({
        materialId: jobMaterialAllocations.materialId,
        reserved: sql<number>`
          coalesce(
            sum(
              greatest(
                (${jobMaterialAllocations.plannedQuantity})::numeric - coalesce((${usage.used})::numeric, 0),
                0
              )
            ),
            0
          )
        `.mapWith(Number),
      })
      .from(jobMaterialAllocations)
      .innerJoin(
        jobs,
        and(eq(jobs.id, jobMaterialAllocations.jobId), eq(jobs.orgId, jobMaterialAllocations.orgId))
      )
      .leftJoin(
        usage,
        and(
          eq(usage.orgId, jobMaterialAllocations.orgId),
          eq(usage.jobId, jobMaterialAllocations.jobId),
          eq(usage.materialId, jobMaterialAllocations.materialId)
        )
      )
      .where(
        and(
          eq(jobMaterialAllocations.orgId, params.orgId),
          inArray(jobMaterialAllocations.materialId, materialIds),
          sql`${jobs.status} <> 'completed'`
        )
      )
      .groupBy(jobMaterialAllocations.materialId);

    const map = new Map<string, number>();
    rows.forEach((r) => map.set(String(r.materialId), Number(r.reserved ?? 0)));
    return ok(map);
  } catch (error) {
    console.error('Error computing material reservations:', error);
    return err('INTERNAL_ERROR', 'Failed to compute reserved quantities', error);
  }
}

export async function getReservedForMaterial(params: {
  orgId: string;
  materialId: string;
}): Promise<Result<number>> {
  const result = await getReservedByMaterial({ orgId: params.orgId, materialIds: [params.materialId] });
  if (!result.ok) return result as any;
  return ok(result.data.get(params.materialId) ?? 0);
}
