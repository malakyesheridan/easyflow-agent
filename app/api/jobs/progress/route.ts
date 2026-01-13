import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { updateJobProgressStatus } from '@/lib/mutations/job_progress';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canUpdateJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

/**
 * PATCH /api/jobs/progress
 *
 * Body:
 * - orgId: string (required)
 * - jobId: string (required)
 * - progressStatus: 'not_started' | 'in_progress' | 'half_complete' | 'completed' (required)
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();

  const orgId = body?.orgId ? String(body.orgId) : null;
  const jobId = body?.jobId;
  const progressStatus = body?.progressStatus;

  if (!jobId || !progressStatus) {
    return err('VALIDATION_ERROR', 'jobId and progressStatus are required');
  }

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canUpdateJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const before = await getJobById(jobId, context.data.orgId);
  if (!before.ok) return before;
  const access = assertJobWriteAccess(before.data, context.data.actor);
  if (!access.ok) return access;
  const result = await updateJobProgressStatus({ orgId: context.data.orgId, jobId, progressStatus });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'STATUS_CHANGE',
      entityType: 'job',
      entityId: jobId,
      before: before.ok ? before.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req, { progressStatus }),
    });
  }
  return result;
});
