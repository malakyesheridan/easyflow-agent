import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listJobHoursLogs } from '@/lib/queries/job_hours_logs';
import { createJobHoursLog } from '@/lib/mutations/job_hours_logs';
import { assertJobWriteAccess, canWriteJobArtifacts, canViewJobs } from '@/lib/authz';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { requireOrgContext } from '@/lib/auth/require';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/job-hours?orgId=...&jobId=...
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
  return await listJobHoursLogs({ orgId: context.data.orgId, jobId });
});

/**
 * POST /api/job-hours
 * Body: { orgId, jobId, minutes, note?, crewMemberId? }
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

  const result = await createJobHoursLog({ ...body, orgId: context.data.orgId, createdByCrewMemberId: actor.crewMemberId });
  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: result.data.orgId,
      jobId: result.data.jobId,
      type: 'hours_logged',
      actorCrewMemberId: actor.crewMemberId,
      payload: { hoursLogId: result.data.id, minutes: result.data.minutes },
    });
  }
  return result;
});
