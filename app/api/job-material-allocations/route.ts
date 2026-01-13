import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { assertJobWriteAccess, canLogMaterialUsage, canViewJobs } from '@/lib/authz';
import { getJobMaterialAllocationById, listJobMaterialAllocations } from '@/lib/queries/job_material_allocations';
import { createJobMaterialAllocation, deleteJobMaterialAllocation, updateJobMaterialAllocation } from '@/lib/mutations/job_material_allocations';
import { requireOrgContext } from '@/lib/auth/require';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/job-material-allocations?orgId=...&jobId=...
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
  return await listJobMaterialAllocations({ orgId: context.data.orgId, jobId });
});

/**
 * POST /api/job-material-allocations
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canLogMaterialUsage(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobId = body?.jobId ? String(body.jobId) : null;
  if (!jobId) return err('VALIDATION_ERROR', 'jobId is required');
  const jobResult = await getJobById(jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;
  const result = await createJobMaterialAllocation({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'job.materials.updated',
      payload: {
        jobId: result.data.jobId,
        materialId: result.data.materialId,
        plannedQuantity: result.data.plannedQuantity,
      },
      actorUserId: actor.userId,
    });
  }
  return result;
});

/**
 * PATCH /api/job-material-allocations
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canLogMaterialUsage(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const existing = await getJobMaterialAllocationById({ orgId: context.data.orgId, id: String(body.id) });
  if (!existing.ok) return existing;
  const jobResult = await getJobById(existing.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;
  const result = await updateJobMaterialAllocation({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'job.materials.updated',
      payload: {
        jobId: result.data.jobId,
        materialId: result.data.materialId,
        plannedQuantity: result.data.plannedQuantity,
      },
      actorUserId: actor.userId,
    });
  }
  return result;
});

/**
 * DELETE /api/job-material-allocations?id=...&orgId=...
 */
export const DELETE = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const id = searchParams.get('id');
  if (!id) return err('VALIDATION_ERROR', 'id query parameter is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canLogMaterialUsage(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const existing = await getJobMaterialAllocationById({ orgId: context.data.orgId, id: String(id) });
  if (!existing.ok) return existing;
  const jobResult = await getJobById(existing.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;
  const result = await deleteJobMaterialAllocation({ orgId: context.data.orgId, id });
  if (result.ok && result.data) {
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'job.materials.updated',
      payload: {
        jobId: result.data.jobId,
        materialId: result.data.materialId,
      },
      actorUserId: actor.userId,
    });
  }
  return result;
});
