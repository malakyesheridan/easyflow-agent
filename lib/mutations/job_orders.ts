import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobOrders, type JobOrder, type NewJobOrder } from '@/db/schema/job_orders';
import { ok, err, type Result } from '@/lib/result';
import { jobOrderCreateSchema, jobOrderDeleteSchema, jobOrderUpdateSchema, type CreateJobOrderInput, type UpdateJobOrderInput } from '@/lib/validators/job_orders';
import { toNumericString } from '@/lib/utils/quantity';

export async function createJobOrder(input: CreateJobOrderInput & { createdByCrewMemberId?: string | null }): Promise<Result<JobOrder>> {
  try {
    const validated = jobOrderCreateSchema.parse(input);
    const db = getDb();

    const values: NewJobOrder = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      supplier: validated.supplier ?? null,
      item: validated.item.trim(),
      quantity: validated.quantity === null || validated.quantity === undefined ? null : toNumericString(validated.quantity),
      unit: validated.unit ?? null,
      status: validated.status?.trim() || 'pending',
      notes: validated.notes ?? null,
      createdByCrewMemberId: input.createdByCrewMemberId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const [row] = await db.insert(jobOrders).values(values).returning();
    return ok(row);
  } catch (error) {
    console.error('Error creating job order:', error);
    return err('INTERNAL_ERROR', 'Failed to create order', error);
  }
}

export async function updateJobOrder(input: UpdateJobOrderInput): Promise<Result<JobOrder>> {
  try {
    const validated = jobOrderUpdateSchema.parse(input);
    const db = getDb();

    const update: Partial<NewJobOrder> = { updatedAt: new Date() };
    if (validated.supplier !== undefined) update.supplier = validated.supplier ?? null;
    if (validated.item !== undefined) update.item = validated.item.trim();
    if (validated.quantity !== undefined) update.quantity = validated.quantity === null ? null : toNumericString(validated.quantity);
    if (validated.unit !== undefined) update.unit = validated.unit ?? null;
    if (validated.status !== undefined) update.status = validated.status?.trim() || 'pending';
    if (validated.notes !== undefined) update.notes = validated.notes ?? null;

    const [row] = await db
      .update(jobOrders)
      .set(update as any)
      .where(and(eq(jobOrders.orgId, validated.orgId), eq(jobOrders.id, validated.id)))
      .returning();
    if (!row) return err('NOT_FOUND', 'Order not found');
    return ok(row);
  } catch (error) {
    console.error('Error updating job order:', error);
    return err('INTERNAL_ERROR', 'Failed to update order', error);
  }
}

export async function deleteJobOrder(params: { orgId: string; id: string }): Promise<Result<JobOrder>> {
  try {
    const validated = jobOrderDeleteSchema.parse(params);
    const db = getDb();
    const [row] = await db
      .delete(jobOrders)
      .where(and(eq(jobOrders.orgId, validated.orgId), eq(jobOrders.id, validated.id)))
      .returning();
    if (!row) return err('NOT_FOUND', 'Order not found');
    return ok(row);
  } catch (error) {
    console.error('Error deleting job order:', error);
    return err('INTERNAL_ERROR', 'Failed to delete order', error);
  }
}

