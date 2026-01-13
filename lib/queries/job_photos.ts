import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobPhotos } from '@/db/schema/job_photos';
import { ok, err, type Result } from '@/lib/result';
import type { JobPhoto } from '@/db/schema/job_photos';

export async function listJobPhotos(params: {
  orgId: string;
  jobId: string;
}): Promise<Result<JobPhoto[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(jobPhotos)
      .where(and(eq(jobPhotos.orgId, params.orgId), eq(jobPhotos.jobId, params.jobId)))
      .orderBy(desc(jobPhotos.createdAt));
    return ok(rows);
  } catch (error) {
    console.error('Error listing job photos:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job photos', error);
  }
}

export async function getJobPhotoById(params: {
  orgId: string;
  id: string;
}): Promise<Result<JobPhoto>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(jobPhotos)
      .where(and(eq(jobPhotos.orgId, params.orgId), eq(jobPhotos.id, params.id)))
      .limit(1);

    if (!row) return err('NOT_FOUND', 'Photo not found');
    return ok(row);
  } catch (error) {
    console.error('Error fetching job photo:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job photo', error);
  }
}
