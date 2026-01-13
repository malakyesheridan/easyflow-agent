import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { materialInventoryEvents } from '@/db/schema/material_inventory_events';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { materials } from '@/db/schema/materials';
import { ok, err, type Result } from '@/lib/result';
import type { MaterialUsageLog, NewMaterialUsageLog } from '@/db/schema/material_usage_logs';
import { materialUsageLogCreateSchema, type CreateMaterialUsageLogInput } from '@/lib/validators/material_usage_logs';
import { toNumericString } from '@/lib/utils/quantity';
import { recomputeMaterialAlertsBestEffort } from '@/lib/mutations/material_alerts';
import { recomputeCrewInstallStatsForOrg } from '@/lib/mutations/crew_install_stats';
import { evaluateJobGuardrailsBestEffort } from '@/lib/financials/jobProfitability';

export async function createMaterialUsageLog(
  input: CreateMaterialUsageLogInput & { loggedByCrewMemberId?: string | null }
): Promise<Result<MaterialUsageLog>> {
  try {
    const validated = materialUsageLogCreateSchema.parse(input);
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      let unitCostCents: number | null = null;

      const [allocation] = await tx
        .select({ unitCostCents: jobMaterialAllocations.unitCostCents })
        .from(jobMaterialAllocations)
        .where(
          and(
            eq(jobMaterialAllocations.orgId, validated.orgId),
            eq(jobMaterialAllocations.jobId, validated.jobId),
            eq(jobMaterialAllocations.materialId, validated.materialId)
          )
        )
        .orderBy(desc(jobMaterialAllocations.updatedAt))
        .limit(1);

      if (allocation?.unitCostCents !== undefined && allocation?.unitCostCents !== null) {
        unitCostCents = allocation.unitCostCents;
      } else {
        const [materialRow] = await tx
          .select({ unitCostCents: materials.unitCostCents })
          .from(materials)
          .where(and(eq(materials.orgId, validated.orgId), eq(materials.id, validated.materialId)))
          .limit(1);
        unitCostCents = materialRow?.unitCostCents ?? null;
      }

      const usageValues: NewMaterialUsageLog = {
        orgId: validated.orgId,
        jobId: validated.jobId,
        materialId: validated.materialId,
        taskId: validated.taskId || null,
        quantityUsed: toNumericString(validated.quantityUsed) as any,
        unitCostCents,
        notes: validated.notes?.trim() || null,
        loggedByCrewMemberId: input.loggedByCrewMemberId ?? null,
        createdAt: new Date(),
      } as any;

      const [usage] = await tx.insert(materialUsageLogs).values(usageValues).returning();
      if (!usage) return err('INTERNAL_ERROR', 'Failed to log usage');

      // Inventory is event-driven: usage also produces a stock movement (negative delta).
      await tx.insert(materialInventoryEvents).values({
        orgId: validated.orgId,
        materialId: validated.materialId,
        eventType: 'job_consumed',
        quantity: toNumericString(-validated.quantityUsed) as any,
        reason: 'Consumed by job',
        jobId: validated.jobId,
        usageLogId: usage.id,
        actorCrewMemberId: input.loggedByCrewMemberId ?? null,
        createdAt: new Date(),
      } as any);

      return ok(usage);
    });

    if (result.ok) {
      void recomputeMaterialAlertsBestEffort({ orgId: validated.orgId, materialId: validated.materialId, jobId: validated.jobId });
      void recomputeCrewInstallStatsForOrg({ orgId: validated.orgId });
      void evaluateJobGuardrailsBestEffort({ orgId: validated.orgId, jobId: validated.jobId });
    }
    return result;
  } catch (error) {
    console.error('Error logging material usage:', error);
    return err('INTERNAL_ERROR', 'Failed to log material usage', error);
  }
}
