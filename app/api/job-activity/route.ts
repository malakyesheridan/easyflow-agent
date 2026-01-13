import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listJobActivity } from '@/lib/queries/job_activity';
import { createJobActivityEvent } from '@/lib/mutations/job_activity';
import { assertJobWriteAccess, canWriteJobArtifacts, canViewJobs } from '@/lib/authz';
import { jobActivityNoteSchema } from '@/lib/validators/job_activity';
import { requireOrgContext } from '@/lib/auth/require';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/job-activity?orgId=...&jobId=...
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
  return await listJobActivity({ orgId: context.data.orgId, jobId, limit: 200 });
});

/**
 * POST /api/job-activity (note)
 * Body: { orgId, jobId, message }
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const validated = jobActivityNoteSchema.parse(body);

  const context = await requireOrgContext(req, validated.orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobResult = await getJobById(validated.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const result = await createJobActivityEvent({
    orgId: context.data.orgId,
    jobId: validated.jobId,
    type: 'note_added',
    actorCrewMemberId: actor.crewMemberId,
    payload: { message: validated.message },
  });

  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'NOTE',
      entityType: 'job',
      entityId: validated.jobId,
      before: null,
      after: { message: validated.message },
      metadata: buildAuditMetadata(req, { activityId: result.data.id }),
    });
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'job.notes.updated',
      payload: {
        jobId: validated.jobId,
      },
      actorUserId: actor.userId,
    });
  }

  return result;
});
