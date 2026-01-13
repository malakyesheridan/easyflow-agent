import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageTemplates } from '@/lib/authz';
import { listJobTypes } from '@/lib/queries/job_types';
import { createJobType, updateJobType } from '@/lib/mutations/job_types';

/**
 * GET /api/job-types?orgId=...&includeArchived=false
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const includeArchived = searchParams.get('includeArchived') === 'true';
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  return await listJobTypes({ orgId: context.data.orgId, includeArchived });
});

/**
 * POST /api/job-types
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageTemplates(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await createJobType({ ...body, orgId: context.data.orgId });
});

/**
 * PATCH /api/job-types
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageTemplates(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await updateJobType({ ...body, orgId: context.data.orgId });
});
