import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { listJobPhotos, getJobPhotoById } from '@/lib/queries/job_photos';
import { deleteJobPhoto, updateJobPhotoAnnotation } from '@/lib/mutations/job_photos';
import { assertJobWriteAccess, canWriteJobArtifacts, canViewJobs } from '@/lib/authz';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { jobPhotoUpdateAnnotationSchema } from '@/lib/validators/job_photos';
import { unlink } from 'fs/promises';
import path from 'path';
import { deleteUploadIfPossible } from '@/lib/uploads/storage';
import { requireOrgContext } from '@/lib/auth/require';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { getJobById } from '@/lib/queries/jobs';

export const runtime = 'nodejs';

/**
 * GET /api/job-photos?orgId=...&jobId=...
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
  return await listJobPhotos({ orgId: context.data.orgId, jobId });
});

/**
 * DELETE /api/job-photos?id=...&orgId=...
 * Best-effort deletes the underlying file if it lives under /public.
 */
export const DELETE = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!id || !jobId) return err('VALIDATION_ERROR', 'id and jobId query parameters are required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const photoResult = await getJobPhotoById({ orgId: context.data.orgId, id });
  if (!photoResult.ok) return photoResult;
  const jobResult = await getJobById(photoResult.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const result = await deleteJobPhoto({ id, orgId: context.data.orgId });
  if (!result.ok) return result;

  const storagePath = result.data.storagePath;
  const resolvedJobId = photoResult.data.jobId;
  if (storagePath.startsWith('/uploads/')) {
    try {
      const full = path.join(process.cwd(), 'public', storagePath);
      await unlink(full);
    } catch {
      // ignore
    }
  }

  // Best-effort remote cleanup (e.g., Supabase Storage) if storagePath is a public URL.
  try {
    await deleteUploadIfPossible(storagePath);
  } catch {
    // ignore
  }

  void createJobActivityEventBestEffort({
    orgId: context.data.orgId,
    jobId: resolvedJobId,
    type: 'photo_deleted',
    actorCrewMemberId: actor.crewMemberId,
    payload: { photoId: id, action: 'deleted' },
  });
  void logAuditEvent({
    orgId: context.data.orgId,
    actorUserId: actor.userId,
    actorType: 'user',
    action: 'PHOTO_DELETE',
    entityType: 'job_photo',
    entityId: id,
    before: result.data,
    after: null,
    metadata: buildAuditMetadata(req, { jobId: resolvedJobId }),
  });

  return ok(undefined);
});

/**
 * PATCH /api/job-photos
 * Body: { orgId, id, jobId?, annotationJson }
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const validated = jobPhotoUpdateAnnotationSchema.parse(body);

  const context = await requireOrgContext(req, validated.orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const before = await getJobPhotoById({ orgId: context.data.orgId, id: validated.id });
  if (!before.ok) return before;
  const jobResult = await getJobById(before.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;
  const result = await updateJobPhotoAnnotation({ ...validated, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'UPDATE',
      entityType: 'job_photo',
      entityId: validated.id,
      before: before.ok ? before.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req, { jobId: validated.jobId }),
    });
  }
  return result;
});
