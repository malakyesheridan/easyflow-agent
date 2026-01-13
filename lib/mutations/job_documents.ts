import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobDocuments, type JobDocument, type NewJobDocument } from '@/db/schema/job_documents';
import { ok, err, type Result } from '@/lib/result';
import { jobDocumentCreateLinkSchema, jobDocumentDeleteSchema, type CreateJobDocumentLinkInput } from '@/lib/validators/job_documents';

export async function createJobDocumentLink(
  input: CreateJobDocumentLinkInput & { createdByCrewMemberId?: string | null }
): Promise<Result<JobDocument>> {
  try {
    const validated = jobDocumentCreateLinkSchema.parse(input);
    const db = getDb();

    const values: NewJobDocument = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      kind: 'link',
      title: validated.title.trim(),
      url: validated.url,
      storagePath: null,
      originalFileName: null,
      mimeType: null,
      bytes: null,
      createdByCrewMemberId: input.createdByCrewMemberId ?? null,
      createdAt: new Date(),
    } as any;

    const [row] = await db.insert(jobDocuments).values(values).returning();
    return ok(row);
  } catch (error) {
    console.error('Error creating job document link:', error);
    return err('INTERNAL_ERROR', 'Failed to create document', error);
  }
}

export async function createJobDocumentFile(input: {
  orgId: string;
  jobId: string;
  title: string;
  storagePath: string;
  originalFileName: string | null;
  mimeType: string | null;
  bytes: number | null;
  createdByCrewMemberId?: string | null;
}): Promise<Result<JobDocument>> {
  try {
    const db = getDb();
    const values: NewJobDocument = {
      orgId: input.orgId,
      jobId: input.jobId,
      kind: 'file',
      title: input.title.trim(),
      url: null,
      storagePath: input.storagePath,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      bytes: input.bytes,
      createdByCrewMemberId: input.createdByCrewMemberId ?? null,
      createdAt: new Date(),
    } as any;

    const [row] = await db.insert(jobDocuments).values(values).returning();
    return ok(row);
  } catch (error) {
    console.error('Error creating job document file:', error);
    return err('INTERNAL_ERROR', 'Failed to create document', error);
  }
}

export async function deleteJobDocument(params: { orgId: string; id: string }): Promise<Result<JobDocument>> {
  try {
    const validated = jobDocumentDeleteSchema.parse(params);
    const db = getDb();
    const [row] = await db
      .delete(jobDocuments)
      .where(and(eq(jobDocuments.orgId, validated.orgId), eq(jobDocuments.id, validated.id)))
      .returning();
    if (!row) return err('NOT_FOUND', 'Document not found');
    return ok(row);
  } catch (error) {
    console.error('Error deleting job document:', error);
    return err('INTERNAL_ERROR', 'Failed to delete document', error);
  }
}

