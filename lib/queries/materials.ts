import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materials } from '@/db/schema/materials';
import { materialInventoryEvents } from '@/db/schema/material_inventory_events';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { ok, err, type Result } from '@/lib/result';
import type { Material } from '@/db/schema/materials';
import { toNumber } from '@/lib/utils/quantity';
import { getReservedByMaterial } from '@/lib/queries/material_reservations';

export type MaterialListRow = Material & {
  currentStock: number;
  allocated: number;
  available: number;
  avgDailyUsage30d: number;
  usage30dTotal: number;
  usageTrendPercent30d: number | null;
  lastStocktakeAt: Date | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function listMaterialsWithStats(orgId: string): Promise<Result<MaterialListRow[]>> {
  try {
    const db = getDb();
    const mats = await db
      .select()
      .from(materials)
      .where(eq(materials.orgId, orgId))
      .orderBy(materials.name);

    if (mats.length === 0) return ok([]);

    const materialIds = mats.map((m) => m.id);

    const stockRows = await db
      .select({
        materialId: materialInventoryEvents.materialId,
        currentStock: sql<number>`coalesce(sum(${materialInventoryEvents.quantity}), 0)`.mapWith(Number),
        lastStocktakeAt: sql<Date | null>`max(case when ${materialInventoryEvents.eventType} = 'stocktake' then ${materialInventoryEvents.createdAt} else null end)`,
      })
      .from(materialInventoryEvents)
      .where(and(eq(materialInventoryEvents.orgId, orgId), inArray(materialInventoryEvents.materialId, materialIds)))
      .groupBy(materialInventoryEvents.materialId);

    const stockById = new Map<string, { currentStock: number; lastStocktakeAt: Date | null }>();
    stockRows.forEach((r) => {
      stockById.set(String(r.materialId), {
        currentStock: Number(r.currentStock ?? 0),
        lastStocktakeAt: (r.lastStocktakeAt as any) ?? null,
      });
    });

    const reservedResult = await getReservedByMaterial({ orgId, materialIds });
    if (!reservedResult.ok) return reservedResult;
    const reservedById = reservedResult.data;

    const now = new Date();
    const today = startOfDay(now);
    const start30 = new Date(today);
    start30.setDate(start30.getDate() - 30);
    const start60 = new Date(today);
    start60.setDate(start60.getDate() - 60);

    const usageRows = await db
      .select({
        materialId: materialUsageLogs.materialId,
        usage30dTotal: sql<number>`coalesce(sum(case when ${materialUsageLogs.createdAt} >= ${start30} then ${materialUsageLogs.quantityUsed} else 0 end), 0)`.mapWith(
          Number
        ),
        usagePrev30dTotal: sql<number>`coalesce(sum(case when ${materialUsageLogs.createdAt} >= ${start60} and ${materialUsageLogs.createdAt} < ${start30} then ${materialUsageLogs.quantityUsed} else 0 end), 0)`.mapWith(
          Number
        ),
      })
      .from(materialUsageLogs)
      .where(and(eq(materialUsageLogs.orgId, orgId), inArray(materialUsageLogs.materialId, materialIds)))
      .groupBy(materialUsageLogs.materialId);

    const usageById = new Map<string, { usage30: number; usagePrev30: number }>();
    usageRows.forEach((r) =>
      usageById.set(String(r.materialId), {
        usage30: Number(r.usage30dTotal ?? 0),
        usagePrev30: Number(r.usagePrev30dTotal ?? 0),
      })
    );

    const rows: MaterialListRow[] = mats.map((m) => {
      const stock = stockById.get(m.id)?.currentStock ?? 0;
      const allocated = reservedById.get(m.id) ?? 0;
      const available = stock - allocated;
      const usage = usageById.get(m.id) ?? { usage30: 0, usagePrev30: 0 };
      const avgDailyUsage30d = usage.usage30 / 30;
      const trend =
        usage.usagePrev30 > 0 ? ((usage.usage30 - usage.usagePrev30) / usage.usagePrev30) * 100 : null;

      return {
        ...m,
        currentStock: stock,
        allocated,
        available,
        usage30dTotal: usage.usage30,
        avgDailyUsage30d,
        usageTrendPercent30d: trend,
        lastStocktakeAt: stockById.get(m.id)?.lastStocktakeAt ?? null,
      };
    });

    return ok(rows);
  } catch (error) {
    console.error('Error listing materials:', error);
    return err('INTERNAL_ERROR', 'Failed to list materials', error);
  }
}

export async function getMaterialById(params: { orgId: string; id: string }): Promise<Result<Material>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(materials)
      .where(and(eq(materials.orgId, params.orgId), eq(materials.id, params.id)))
      .limit(1);
    if (!row) return err('NOT_FOUND', 'Material not found');
    return ok(row);
  } catch (error) {
    console.error('Error getting material:', error);
    return err('INTERNAL_ERROR', 'Failed to get material', error);
  }
}

export type MaterialUsageSeriesPoint = { day: string; totalUsed: number };

export async function getMaterialUsageSeries(params: {
  orgId: string;
  materialId: string;
  days: 7 | 30 | 180;
}): Promise<Result<MaterialUsageSeriesPoint[]>> {
  try {
    const db = getDb();
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - params.days);

    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${materialUsageLogs.createdAt}), 'YYYY-MM-DD')`.mapWith(String),
        totalUsed: sql<number>`coalesce(sum(${materialUsageLogs.quantityUsed}), 0)`.mapWith(Number),
      })
      .from(materialUsageLogs)
      .where(
        and(
          eq(materialUsageLogs.orgId, params.orgId),
          eq(materialUsageLogs.materialId, params.materialId),
          sql`${materialUsageLogs.createdAt} >= ${start}`
        )
      )
      .groupBy(sql`date_trunc('day', ${materialUsageLogs.createdAt})`)
      .orderBy(sql`date_trunc('day', ${materialUsageLogs.createdAt})`);

    const byDay = new Map<string, number>();
    rows.forEach((r) => byDay.set(String(r.day), Number(r.totalUsed ?? 0)));

    const points: MaterialUsageSeriesPoint[] = [];
    for (let i = params.days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      points.push({ day: key, totalUsed: toNumber(byDay.get(key) ?? 0) });
    }

    return ok(points);
  } catch (error) {
    console.error('Error getting material usage series:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch usage series', error);
  }
}
