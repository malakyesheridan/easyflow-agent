import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getDb } from '@/lib/db';
import { jobTypes, type JobType, type NewJobType } from '@/db/schema/job_types';
import { ok, err, type Result } from '@/lib/result';
import { createJobTypeSchema, updateJobTypeSchema, type CreateJobTypeInput, type UpdateJobTypeInput } from '@/lib/validators/job_types';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function ensureUniqueKey(orgId: string, base: string): Promise<string> {
  const db = getDb();
  const key = base || `type-${randomBytes(3).toString('hex')}`;
  const [existing] = await db
    .select({ id: jobTypes.id })
    .from(jobTypes)
    .where(and(eq(jobTypes.orgId, orgId), eq(jobTypes.key, key)))
    .limit(1);
  if (!existing) return key;
  return `${key}-${randomBytes(2).toString('hex')}`;
}

export async function createJobType(input: CreateJobTypeInput): Promise<Result<JobType>> {
  try {
    const validated = createJobTypeSchema.parse(input);
    const db = getDb();

    const baseKey = validated.key?.trim() || slugify(validated.label);
    const key = await ensureUniqueKey(validated.orgId, baseKey);

    if (validated.isDefault) {
      await db
        .update(jobTypes)
        .set({ isDefault: false })
        .where(eq(jobTypes.orgId, validated.orgId));
    }

    const values: NewJobType = {
      orgId: validated.orgId,
      key,
      label: validated.label.trim(),
      description: validated.description?.trim() || null,
      color: validated.color?.trim() || null,
      defaultDurationMinutes: validated.defaultDurationMinutes ?? null,
      requirePhotos: validated.requirePhotos ?? false,
      requireMaterials: validated.requireMaterials ?? false,
      requireReports: validated.requireReports ?? false,
      isDefault: validated.isDefault ?? false,
      updatedAt: new Date(),
    } as any;

    const [row] = await db.insert(jobTypes).values(values).returning();
    if (!row) return err('INTERNAL_ERROR', 'Failed to create job type');
    return ok(row);
  } catch (error) {
    console.error('Error creating job type:', error);
    return err('INTERNAL_ERROR', 'Failed to create job type', error);
  }
}

export async function updateJobType(input: UpdateJobTypeInput): Promise<Result<JobType>> {
  try {
    const validated = updateJobTypeSchema.parse(input);
    const db = getDb();

    const update: Partial<NewJobType> = { updatedAt: new Date() };
    if (validated.key !== undefined) update.key = validated.key.trim();
    if (validated.label !== undefined) update.label = validated.label.trim();
    if (validated.description !== undefined) update.description = validated.description?.trim() || null;
    if (validated.color !== undefined) update.color = validated.color?.trim() || null;
    if (validated.defaultDurationMinutes !== undefined) update.defaultDurationMinutes = validated.defaultDurationMinutes ?? null;
    if (validated.requirePhotos !== undefined) update.requirePhotos = validated.requirePhotos;
    if (validated.requireMaterials !== undefined) update.requireMaterials = validated.requireMaterials;
    if (validated.requireReports !== undefined) update.requireReports = validated.requireReports;
    if (validated.isDefault !== undefined) update.isDefault = validated.isDefault;
    if (validated.archivedAt !== undefined) update.archivedAt = validated.archivedAt ? new Date(validated.archivedAt) : null;

    if (validated.isDefault) {
      await db
        .update(jobTypes)
        .set({ isDefault: false })
        .where(eq(jobTypes.orgId, validated.orgId));
    }

    const [row] = await db
      .update(jobTypes)
      .set(update)
      .where(and(eq(jobTypes.id, validated.id), eq(jobTypes.orgId, validated.orgId)))
      .returning();

    if (!row) return err('NOT_FOUND', 'Job type not found');
    return ok(row);
  } catch (error) {
    console.error('Error updating job type:', error);
    return err('INTERNAL_ERROR', 'Failed to update job type', error);
  }
}
