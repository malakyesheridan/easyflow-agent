import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs, canViewJobs, canWriteJobArtifacts } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';
import { updateJobProductivity } from '@/lib/mutations/job_productivity';
import { jobProductivityQuerySchema } from '@/lib/validators/job_productivity';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

/**
 * GET /api/job-productivity?orgId=...&jobId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!jobId) return err('VALIDATION_ERROR', 'jobId query parameter is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const validated = jobProductivityQuerySchema.parse({ orgId: context.data.orgId, jobId });
  const jobResult = await getJobById(validated.jobId, validated.orgId, context.data.actor);
  if (!jobResult.ok) return jobResult;

  const job = jobResult.data;
  return ok({
    jobId: job.id,
    plannedM2: job.plannedM2,
    variationM2: job.variationM2,
    claimedM2: job.claimedM2,
    acceptedM2: job.acceptedM2,
    reworkM2: job.reworkM2,
    acceptedM2ApprovedBy: job.acceptedM2ApprovedBy,
    acceptedM2ApprovedAt: job.acceptedM2ApprovedAt,
    complexityAccessDifficulty: job.complexityAccessDifficulty,
    complexityHeightLiftRequirement: job.complexityHeightLiftRequirement,
    complexityPanelHandlingSize: job.complexityPanelHandlingSize,
    complexitySiteConstraints: job.complexitySiteConstraints,
    complexityDetailingComplexity: job.complexityDetailingComplexity,
    qualityDefectCount: job.qualityDefectCount,
    qualityCallbackFlag: job.qualityCallbackFlag,
    qualityMissingDocsFlag: job.qualityMissingDocsFlag,
    qualitySafetyFlag: job.qualitySafetyFlag,
  });
});

/**
 * PATCH /api/job-productivity
 * Body: { orgId, jobId, ...fields }
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.jobId) return err('VALIDATION_ERROR', 'jobId is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const actor = context.data.actor;
  const jobResult = await getJobById(String(body.jobId), context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const managerFields = [
    'acceptedM2',
    'plannedM2',
    'variationM2',
    'complexityAccessDifficulty',
    'complexityHeightLiftRequirement',
    'complexityPanelHandlingSize',
    'complexitySiteConstraints',
    'complexityDetailingComplexity',
    'qualityDefectCount',
    'qualityCallbackFlag',
    'qualityMissingDocsFlag',
    'qualitySafetyFlag',
  ];
  const isManagerUpdate = managerFields.some((key) => key in body);
  if (isManagerUpdate && !canManageJobs(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  if (!isManagerUpdate && !canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const before = jobResult.data;
  const result = await updateJobProductivity({
    ...body,
    orgId: context.data.orgId,
    approvedByUserId: actor.userId,
  });
  if (!result.ok) return result;

  const after = result.data;
  const claimedChanged = before.claimedM2 !== after.claimedM2;
  const acceptedChanged = before.acceptedM2 !== after.acceptedM2;

  if (claimedChanged) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'UPDATE',
      entityType: 'job_output',
      entityId: after.id,
      before: { claimedM2: before.claimedM2 },
      after: { claimedM2: after.claimedM2 },
      metadata: buildAuditMetadata(req, { jobId: after.id, field: 'claimedM2' }),
    });
  }

  if (acceptedChanged) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'UPDATE',
      entityType: 'job_output',
      entityId: after.id,
      before: { acceptedM2: before.acceptedM2, acceptedM2ApprovedAt: before.acceptedM2ApprovedAt },
      after: { acceptedM2: after.acceptedM2, acceptedM2ApprovedAt: after.acceptedM2ApprovedAt },
      metadata: buildAuditMetadata(req, {
        jobId: after.id,
        field: 'acceptedM2',
        previousApproval: before.acceptedM2ApprovedAt ?? null,
      }),
    });
  }

  return ok(after);
});
