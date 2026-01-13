import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { assertJobWriteAccess, canWriteJobArtifacts } from '@/lib/authz';
import { createJobPhoto } from '@/lib/mutations/job_photos';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { storeUpload } from '@/lib/uploads/storage';
import { requireOrgContext } from '@/lib/auth/require';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { getJobById } from '@/lib/queries/jobs';

export const runtime = 'nodejs';

/**
 * POST /api/job-photos/upload (multipart/form-data)
 * Fields: orgId, jobId, file
 */
export const POST = withRoute(async (req: Request) => {
  const form = await req.formData();
  const orgId = String(form.get('orgId') || '');
  const jobId = String(form.get('jobId') || '');
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
    const stored = await storeUpload({ orgId: context.data.orgId, jobId, namespace: 'job-photos', file });
    storagePath = stored.storagePath;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed';
    return err('INTERNAL_ERROR', message);
  }

  const result = await createJobPhoto({
    orgId: context.data.orgId,
    jobId,
    storagePath,
    originalFileName: file.name || null,
    mimeType: file.type || null,
    bytes: file.size || null,
    createdByCrewMemberId: actor.crewMemberId,
  });

  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'PHOTO_UPLOAD',
      entityType: 'job_photo',
      entityId: result.data.id,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(req, { jobId }),
    });
    void createJobActivityEventBestEffort({
      orgId: context.data.orgId,
      jobId,
      type: 'photo_uploaded',
      actorCrewMemberId: actor.crewMemberId,
      payload: { photoId: result.data.id, storagePath: result.data.storagePath },
    });

    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'job.photos.added',
      payload: {
        jobId,
        photoId: result.data.id,
      },
      actorUserId: actor.userId,
    });
  }

  return result;
});
