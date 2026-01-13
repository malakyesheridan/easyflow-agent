import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobDocuments, type JobDocument } from '@/db/schema/job_documents';
import { ok, err, type Result } from '@/lib/result';
import { jobDocumentsListSchema } from '@/lib/validators/job_documents';

export async function listJobDocuments(params: { orgId: string; jobId: string }): Promise<Result<JobDocument[]>> {
  try {
    const validated = jobDocumentsListSchema.parse(params);
    const db = getDb();
    const rows = await db
      .select()
      .from(jobDocuments)
      .where(and(eq(jobDocuments.orgId, validated.orgId), eq(jobDocuments.jobId, validated.jobId)))
      .orderBy(desc(jobDocuments.createdAt));
    return ok(rows);
  } catch (error) {
    console.error('Error listing job documents:', error);
    return err('INTERNAL_ERROR', 'Failed to list job documents', error);
  }
}

export async function getJobDocumentById(params: { orgId: string; id: string }): Promise<Result<JobDocument>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(jobDocuments)
      .where(and(eq(jobDocuments.orgId, params.orgId), eq(jobDocuments.id, params.id)))
      .limit(1);
    if (!row) return err('NOT_FOUND', 'Job document not found');
    return ok(row);
  } catch (error) {
    console.error('Error fetching job document:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job document', error);
  }
}
