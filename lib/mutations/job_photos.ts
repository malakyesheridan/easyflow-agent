import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobPhotos } from '@/db/schema/job_photos';
import { ok, err, type Result } from '@/lib/result';
import type { JobPhoto, NewJobPhoto } from '@/db/schema/job_photos';
import {
  jobPhotoCreateSchema,
  jobPhotoDeleteSchema,
  jobPhotoUpdateAnnotationSchema,
  type CreateJobPhotoInput,
  type UpdateJobPhotoAnnotationInput,
} from '@/lib/validators/job_photos';

export async function createJobPhoto(input: CreateJobPhotoInput): Promise<Result<JobPhoto>> {
  try {
    const validated = jobPhotoCreateSchema.parse(input);
    const db = getDb();

    const values: NewJobPhoto = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      storagePath: validated.storagePath,
      originalFileName: validated.originalFileName ?? null,
      mimeType: validated.mimeType ?? null,
      bytes: validated.bytes ?? null,
      annotationJson: (validated.annotationJson ?? null) as any,
      createdByCrewMemberId: validated.createdByCrewMemberId ?? null,
    };

    const [row] = await db.insert(jobPhotos).values(values).returning();
    return ok(row);
  } catch (error) {
    console.error('Error creating job photo:', error);
    return err('INTERNAL_ERROR', 'Failed to create job photo', error);
  }
}

export async function deleteJobPhoto(params: { id: string; orgId: string }): Promise<Result<JobPhoto>> {
  try {
    const validated = jobPhotoDeleteSchema.parse(params);
    const db = getDb();
    const [row] = await db
      .delete(jobPhotos)
      .where(and(eq(jobPhotos.id, validated.id), eq(jobPhotos.orgId, validated.orgId)))
      .returning();
    if (!row) return err('NOT_FOUND', 'Job photo not found');
    return ok(row);
  } catch (error) {
    console.error('Error deleting job photo:', error);
    return err('INTERNAL_ERROR', 'Failed to delete job photo', error);
  }
}

export async function updateJobPhotoAnnotation(
  input: UpdateJobPhotoAnnotationInput
): Promise<Result<JobPhoto>> {
  try {
    const validated = jobPhotoUpdateAnnotationSchema.parse(input);
    const db = getDb();

    const whereClause = validated.jobId
      ? and(eq(jobPhotos.id, validated.id), eq(jobPhotos.orgId, validated.orgId), eq(jobPhotos.jobId, validated.jobId))
      : and(eq(jobPhotos.id, validated.id), eq(jobPhotos.orgId, validated.orgId));

    const [row] = await db
      .update(jobPhotos)
      .set({ annotationJson: (validated.annotationJson ?? null) as any })
      .where(whereClause)
      .returning();

    if (!row) return err('NOT_FOUND', 'Job photo not found');
    return ok(row);
  } catch (error) {
    console.error('Error updating job photo annotation:', error);
    return err('INTERNAL_ERROR', 'Failed to update photo notes', error);
  }
}
