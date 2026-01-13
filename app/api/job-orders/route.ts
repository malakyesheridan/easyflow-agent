import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { getJobOrderById, listJobOrders } from '@/lib/queries/job_orders';
import { createJobOrder, deleteJobOrder, updateJobOrder } from '@/lib/mutations/job_orders';
import { assertJobWriteAccess, canWriteJobArtifacts, canViewJobs } from '@/lib/authz';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { requireOrgContext } from '@/lib/auth/require';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/job-orders?orgId=...&jobId=...
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
  return await listJobOrders({ orgId: context.data.orgId, jobId });
});

/**
 * POST /api/job-orders
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

  const result = await createJobOrder({ ...body, orgId: context.data.orgId, createdByCrewMemberId: actor.crewMemberId });
  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: result.data.orgId,
      jobId: result.data.jobId,
      type: 'order_created',
      actorCrewMemberId: actor.crewMemberId,
      payload: { orderId: result.data.id, item: result.data.item, status: result.data.status },
    });
  }
  return result;
});

/**
 * PATCH /api/job-orders
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const existing = await getJobOrderById({ orgId: context.data.orgId, id: String(body.id) });
  if (!existing.ok) return existing;
  const jobResult = await getJobById(existing.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const result = await updateJobOrder({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: result.data.orgId,
      jobId: result.data.jobId,
      type: 'order_updated',
      actorCrewMemberId: actor.crewMemberId,
      payload: { orderId: result.data.id, item: result.data.item, status: result.data.status },
    });
  }
  return result;
});

/**
 * DELETE /api/job-orders?id=...&orgId=...&jobId=...
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
  const existing = await getJobOrderById({ orgId: context.data.orgId, id: String(id) });
  if (!existing.ok) return existing;
  const jobResult = await getJobById(existing.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const resolvedJobId = existing.data.jobId;
  const result = await deleteJobOrder({ orgId: context.data.orgId, id });
  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: context.data.orgId,
      jobId: resolvedJobId,
      type: 'order_deleted',
      actorCrewMemberId: actor.crewMemberId,
      payload: { orderId: id, item: result.data.item },
    });
  }
  return result;
});
