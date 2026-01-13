import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobContacts } from '@/db/schema/job_contacts';
import { ok, err, type Result } from '@/lib/result';
import type { JobContact, NewJobContact } from '@/db/schema/job_contacts';
import {
  jobContactCreateSchema,
  jobContactDeleteSchema,
  jobContactUpdateSchema,
  type CreateJobContactInput,
  type UpdateJobContactInput,
} from '@/lib/validators/job_contacts';

export async function createJobContact(input: CreateJobContactInput): Promise<Result<JobContact>> {
  try {
    const validated = jobContactCreateSchema.parse(input);
    const db = getDb();

    const values: NewJobContact = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      name: validated.name,
      role: validated.role ?? null,
      phone: validated.phone ?? null,
      email: validated.email ?? null,
      notes: validated.notes ?? null,
    };

    const [row] = await db.insert(jobContacts).values(values).returning();
    return ok(row);
  } catch (error) {
    console.error('Error creating job contact:', error);
    return err('INTERNAL_ERROR', 'Failed to create job contact', error);
  }
}

export async function updateJobContact(input: UpdateJobContactInput): Promise<Result<JobContact>> {
  try {
    const validated = jobContactUpdateSchema.parse(input);
    const db = getDb();

    const update: Partial<NewJobContact> = { updatedAt: new Date() };
    if (validated.name !== undefined) update.name = validated.name;
    if (validated.role !== undefined) update.role = validated.role ?? null;
    if (validated.phone !== undefined) update.phone = validated.phone ?? null;
    if (validated.email !== undefined) update.email = validated.email ?? null;
    if (validated.notes !== undefined) update.notes = validated.notes ?? null;

    const [row] = await db
      .update(jobContacts)
      .set(update)
      .where(and(eq(jobContacts.id, validated.id), eq(jobContacts.orgId, validated.orgId)))
      .returning();

    if (!row) return err('NOT_FOUND', 'Job contact not found');
    return ok(row);
  } catch (error) {
    console.error('Error updating job contact:', error);
    return err('INTERNAL_ERROR', 'Failed to update job contact', error);
  }
}

export async function deleteJobContact(params: { id: string; orgId: string }): Promise<Result<void>> {
  try {
    const validated = jobContactDeleteSchema.parse(params);
    const db = getDb();
    const rows = await db
      .delete(jobContacts)
      .where(and(eq(jobContacts.id, validated.id), eq(jobContacts.orgId, validated.orgId)))
      .returning();
    if (rows.length === 0) return err('NOT_FOUND', 'Job contact not found');
    return ok(undefined);
  } catch (error) {
    console.error('Error deleting job contact:', error);
    return err('INTERNAL_ERROR', 'Failed to delete job contact', error);
  }
}

