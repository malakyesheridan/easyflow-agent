import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageJobs } from '@/lib/authz';
import { listJobCosts, getJobCostById } from '@/lib/queries/job_costs';
import { createJobCost, updateJobCost, deleteJobCost } from '@/lib/mutations/job_costs';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { evaluateJobGuardrailsBestEffort } from '@/lib/financials/jobProfitability';

/**
 * GET /api/job-costs?orgId=...&jobId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!jobId) return err('VALIDATION_ERROR', 'jobId query parameter is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await listJobCosts({ orgId: context.data.orgId, jobId });
});

/**
 * POST /api/job-costs
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const result = await createJobCost({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'CREATE',
      entityType: 'job_cost',
      entityId: result.data.id,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(req, { jobId: result.data.jobId }),
    });
    void evaluateJobGuardrailsBestEffort({
      orgId: context.data.orgId,
      jobId: result.data.jobId,
      actorUserId: context.data.actor.userId,
    });
  }
  return result;
});

/**
 * PATCH /api/job-costs
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const before = await getJobCostById({ orgId: context.data.orgId, id: String(body.id) });
  const result = await updateJobCost({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'UPDATE',
      entityType: 'job_cost',
      entityId: result.data.id,
      before: before.ok ? before.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req, { jobId: result.data.jobId }),
    });
    void evaluateJobGuardrailsBestEffort({
      orgId: context.data.orgId,
      jobId: result.data.jobId,
      actorUserId: context.data.actor.userId,
    });
  }
  return result;
});

/**
 * DELETE /api/job-costs?id=...&orgId=...
 */
export const DELETE = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const id = searchParams.get('id');
  if (!id) return err('VALIDATION_ERROR', 'id query parameter is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const before = await getJobCostById({ orgId: context.data.orgId, id });
  const result = await deleteJobCost({ orgId: context.data.orgId, id });
  if (result.ok && result.data) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'DELETE',
      entityType: 'job_cost',
      entityId: result.data.id,
      before: before.ok ? before.data : null,
      after: null,
      metadata: buildAuditMetadata(req, { jobId: result.data.jobId }),
    });
    void evaluateJobGuardrailsBestEffort({
      orgId: context.data.orgId,
      jobId: result.data.jobId,
      actorUserId: context.data.actor.userId,
    });
  }
  return result;
});
