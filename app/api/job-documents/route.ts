import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getJobDocumentById, listJobDocuments } from '@/lib/queries/job_documents';
import { createJobDocumentLink, deleteJobDocument } from '@/lib/mutations/job_documents';
import { assertJobWriteAccess, canWriteJobArtifacts, canViewJobs } from '@/lib/authz';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { unlink } from 'fs/promises';
import path from 'path';
import { deleteUploadIfPossible } from '@/lib/uploads/storage';
import { requireOrgContext } from '@/lib/auth/require';
import { getJobById } from '@/lib/queries/jobs';

export const runtime = 'nodejs';

/**
 * GET /api/job-documents?orgId=...&jobId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!jobId) return err('VALIDATION_ERROR', 'jobId query parameter is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobResult = await getJobById(jobId, context.data.orgId, context.data.actor);
  if (!jobResult.ok) return jobResult;
  return await listJobDocuments({ orgId: context.data.orgId, jobId });
});

/**
 * POST /api/job-documents
 * Body: { orgId, jobId, title, url }
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.jobId) return err('VALIDATION_ERROR', 'jobId is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobResult = await getJobById(String(body.jobId), context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const result = await createJobDocumentLink({
    ...body,
    orgId: context.data.orgId,
    createdByCrewMemberId: actor.crewMemberId,
  });
  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: result.data.orgId,
      jobId: result.data.jobId,
      type: 'document_linked',
      actorCrewMemberId: actor.crewMemberId,
      payload: { documentId: result.data.id, title: result.data.title, url: result.data.url },
    });
  }
  return result;
});

/**
 * DELETE /api/job-documents?id=...&orgId=...&jobId=...
 * Best-effort deletes the underlying file if it lives under /public.
 */
export const DELETE = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!id || !jobId) return err('VALIDATION_ERROR', 'id and jobId are required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const documentResult = await getJobDocumentById({ orgId: context.data.orgId, id });
  if (!documentResult.ok) return documentResult;
  const jobResult = await getJobById(documentResult.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const resolvedJobId = documentResult.data.jobId;
  const result = await deleteJobDocument({ id, orgId: context.data.orgId });
  if (!result.ok) return result;

  const storagePath = result.data.storagePath;
  if (storagePath && storagePath.startsWith('/uploads/')) {
    try {
      const full = path.join(process.cwd(), 'public', storagePath);
      await unlink(full);
    } catch {
      // ignore
    }
  }

  // Best-effort remote cleanup (e.g., Supabase Storage) if storagePath is a public URL.
  if (storagePath) {
    try {
      await deleteUploadIfPossible(storagePath);
    } catch {
      // ignore
    }
  }

  void createJobActivityEventBestEffort({
    orgId: context.data.orgId,
    jobId: resolvedJobId,
    type: 'document_deleted',
    actorCrewMemberId: actor.crewMemberId,
    payload: { documentId: id, title: result.data.title },
  });

  return ok(undefined);
});
