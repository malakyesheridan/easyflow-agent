import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { materials } from '@/db/schema/materials';
import { ok, err, type Result } from '@/lib/result';

export type MaterialUsageUnitSummary = {
  unit: string;
  totalUsed: number;
  logCount: number;
};

export type MaterialUsageSummary = {
  startDate: string;
  endDate: string;
  unitTotals: MaterialUsageUnitSummary[];
  distinctUnits: number;
  totalLogs: number;
};

export async function getMaterialUsageSummary(params: {
  orgId: string;
  startDate: Date;
  endDate: Date;
}): Promise<Result<MaterialUsageSummary>> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        unit: materials.unit,
        totalUsed: sql<number>`coalesce(sum(${materialUsageLogs.quantityUsed}), 0)`.mapWith(Number),
        logCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(materialUsageLogs)
      .innerJoin(
        materials,
        and(eq(materials.id, materialUsageLogs.materialId), eq(materials.orgId, materialUsageLogs.orgId))
      )
      .where(
        and(
          eq(materialUsageLogs.orgId, params.orgId),
          sql`${materialUsageLogs.createdAt} >= ${params.startDate}`,
          sql`${materialUsageLogs.createdAt} < ${params.endDate}`
        )
      )
      .groupBy(materials.unit)
      .orderBy(sql`coalesce(sum(${materialUsageLogs.quantityUsed}), 0) desc`);

    const unitTotals: MaterialUsageUnitSummary[] = rows.map((r) => ({
      unit: String(r.unit),
      totalUsed: Number(r.totalUsed ?? 0),
      logCount: Number(r.logCount ?? 0),
    }));

    return ok({
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
      unitTotals,
      distinctUnits: unitTotals.length,
      totalLogs: unitTotals.reduce((sum, u) => sum + u.logCount, 0),
    });
  } catch (error) {
    console.error('Error getting material usage summary:', error);
    return err('INTERNAL_ERROR', 'Failed to compute material usage summary', error);
  }
}

