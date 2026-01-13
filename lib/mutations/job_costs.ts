import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobCosts, type JobCost, type NewJobCost } from '@/db/schema/job_costs';
import { ok, err, type Result } from '@/lib/result';
import { toNumericString } from '@/lib/utils/quantity';
import {
  jobCostCreateSchema,
  jobCostUpdateSchema,
  jobCostDeleteSchema,
  type CreateJobCostInput,
  type UpdateJobCostInput,
} from '@/lib/validators/job_costs';

function computeTotalCostCents(params: {
  quantity: number | null;
  unitCostCents: number | null;
  totalCostCents: number | null;
}): number | null {
  if (Number.isFinite(params.totalCostCents ?? NaN)) {
    return Math.max(0, Math.round(Number(params.totalCostCents)));
  }
  if (Number.isFinite(params.quantity ?? NaN) && Number.isFinite(params.unitCostCents ?? NaN)) {
    return Math.max(0, Math.round(Number(params.quantity) * Number(params.unitCostCents)));
  }
  return null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createJobCost(input: CreateJobCostInput): Promise<Result<JobCost>> {
  try {
    const validated = jobCostCreateSchema.parse(input);
    const db = getDb();

    const totalCostCents = computeTotalCostCents({
      quantity: validated.quantity ?? null,
      unitCostCents: validated.unitCostCents ?? null,
      totalCostCents: validated.totalCostCents ?? null,
    });
    if (totalCostCents === null) return err('VALIDATION_ERROR', 'Total cost could not be derived');

    const values: NewJobCost = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      costType: validated.costType,
      referenceId: validated.referenceId ?? null,
      description: validated.description?.trim() || null,
      quantity:
        validated.quantity === null || validated.quantity === undefined
          ? null
          : toNumericString(validated.quantity),
      unitCostCents: validated.unitCostCents ?? null,
      totalCostCents,
      source: validated.source ?? 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const [row] = await db.insert(jobCosts).values(values).returning();
    if (!row) return err('INTERNAL_ERROR', 'Failed to create cost');
    return ok(row);
  } catch (error) {
    console.error('Error creating job cost:', error);
    return err('INTERNAL_ERROR', 'Failed to create job cost', error);
  }
}

export async function updateJobCost(input: UpdateJobCostInput): Promise<Result<JobCost>> {
  try {
    const validated = jobCostUpdateSchema.parse(input);
    const db = getDb();

    const [existing] = await db
      .select()
      .from(jobCosts)
      .where(and(eq(jobCosts.id, validated.id), eq(jobCosts.orgId, validated.orgId)))
      .limit(1);
    if (!existing) return err('NOT_FOUND', 'Cost entry not found');

    const nextQuantity = parseOptionalNumber(
      validated.quantity !== undefined ? validated.quantity : existing.quantity ?? null
    );
    const nextUnitCostCents = parseOptionalNumber(
      validated.unitCostCents !== undefined ? validated.unitCostCents : existing.unitCostCents ?? null
    );

    let nextTotalCostCents =
      validated.totalCostCents !== undefined ? validated.totalCostCents : existing.totalCostCents ?? null;

    if (
      validated.totalCostCents === undefined &&
      (validated.quantity !== undefined || validated.unitCostCents !== undefined)
    ) {
      const recalculated = computeTotalCostCents({
        quantity: nextQuantity,
        unitCostCents: nextUnitCostCents,
        totalCostCents: null,
      });
      if (recalculated !== null) nextTotalCostCents = recalculated;
    }

    if (nextTotalCostCents === null) return err('VALIDATION_ERROR', 'Total cost could not be derived');

    const update: Partial<NewJobCost> = {
      updatedAt: new Date(),
      totalCostCents: nextTotalCostCents,
    };
    if (validated.costType !== undefined) update.costType = validated.costType;
    if (validated.referenceId !== undefined) update.referenceId = validated.referenceId;
    if (validated.description !== undefined) update.description = validated.description?.trim() || null;
    if (validated.quantity !== undefined) {
      update.quantity = validated.quantity === null ? null : toNumericString(validated.quantity);
    }
    if (validated.unitCostCents !== undefined) update.unitCostCents = validated.unitCostCents;

    const [row] = await db
      .update(jobCosts)
      .set(update as any)
      .where(and(eq(jobCosts.id, validated.id), eq(jobCosts.orgId, validated.orgId)))
      .returning();

    if (!row) return err('INTERNAL_ERROR', 'Failed to update cost');
    return ok(row);
  } catch (error) {
    console.error('Error updating job cost:', error);
    return err('INTERNAL_ERROR', 'Failed to update job cost', error);
  }
}

export async function deleteJobCost(params: { id: string; orgId: string }): Promise<Result<JobCost | null>> {
  try {
    const validated = jobCostDeleteSchema.parse(params);
    const db = getDb();
    const [row] = await db
      .delete(jobCosts)
      .where(and(eq(jobCosts.id, validated.id), eq(jobCosts.orgId, validated.orgId)))
      .returning();
    return ok(row ?? null);
  } catch (error) {
    console.error('Error deleting job cost:', error);
    return err('INTERNAL_ERROR', 'Failed to delete job cost', error);
  }
}
