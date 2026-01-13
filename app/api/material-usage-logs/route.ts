import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { assertJobWriteAccess, canLogMaterialUsage } from '@/lib/authz';
import { createMaterialUsageLog } from '@/lib/mutations/material_usage_logs';
import { listMaterialUsageLogs } from '@/lib/queries/material_usage_logs';
import { materialUsageLogListSchema } from '@/lib/validators/material_usage_logs';
import { requireOrgContext } from '@/lib/auth/require';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { toNumber } from '@/lib/utils/quantity';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/material-usage-logs?orgId=...&jobId=...&materialId=...&limit=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const validated = materialUsageLogListSchema.parse({
    orgId: context.data.orgId,
    jobId: searchParams.get('jobId') || undefined,
    materialId: searchParams.get('materialId') || undefined,
    limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
  });

  return await listMaterialUsageLogs({ ...validated, actor: context.data.actor });
});

/**
 * POST /api/material-usage-logs
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canLogMaterialUsage(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  if (body?.jobId) {
    const jobResult = await getJobById(String(body.jobId), context.data.orgId);
    if (!jobResult.ok) return jobResult;
    const access = assertJobWriteAccess(jobResult.data, actor);
    if (!access.ok) return access;
  }
  const result = await createMaterialUsageLog({ ...body, orgId: context.data.orgId, loggedByCrewMemberId: actor.crewMemberId });
  if (result.ok) {
    const payload = {
      materialId: result.data.materialId,
      jobId: result.data.jobId ?? undefined,
      quantity: toNumber(result.data.quantityUsed),
    };
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'material.usage.recorded',
      payload,
      actorUserId: actor.userId,
    });
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'material.stock.updated',
      payload,
      actorUserId: actor.userId,
    });
  }
  return result;
});
