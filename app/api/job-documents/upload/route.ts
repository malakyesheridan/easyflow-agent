import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { assertJobWriteAccess, canWriteJobArtifacts } from '@/lib/authz';
import { createJobDocumentFile } from '@/lib/mutations/job_documents';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { storeUpload } from '@/lib/uploads/storage';
import { requireOrgContext } from '@/lib/auth/require';
import { getJobById } from '@/lib/queries/jobs';

export const runtime = 'nodejs';

/**
 * POST /api/job-documents/upload (multipart/form-data)
 * Fields: orgId, jobId, file, title?
 */
export const POST = withRoute(async (req: Request) => {
  const form = await req.formData();
  const orgId = String(form.get('orgId') || '');
  const jobId = String(form.get('jobId') || '');
  const title = String(form.get('title') || '');
  const file = form.get('file');

  if (!jobId) return err('VALIDATION_ERROR', 'jobId is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!(file instanceof File)) return err('VALIDATION_ERROR', 'file is required');

  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobResult = await getJobById(jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  let storagePath: string;
  try {
    const stored = await storeUpload({ orgId: context.data.orgId, jobId, namespace: 'job-documents', file });
    storagePath = stored.storagePath;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed';
    return err('INTERNAL_ERROR', message);
  }

  const result = await createJobDocumentFile({
    orgId: context.data.orgId,
    jobId,
    title: title.trim() || file.name || 'Document',
    storagePath,
    originalFileName: file.name || null,
    mimeType: file.type || null,
    bytes: file.size || null,
    createdByCrewMemberId: actor.crewMemberId,
  });

  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: context.data.orgId,
      jobId,
      type: 'document_uploaded',
      actorCrewMemberId: actor.crewMemberId,
      payload: { documentId: result.data.id, title: result.data.title, storagePath: result.data.storagePath },
    });
  }

  return result;
});
