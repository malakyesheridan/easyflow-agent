import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageTemplates } from '@/lib/authz';
import { listWorkTemplates } from '@/lib/queries/work_templates';
import { createWorkTemplate, updateWorkTemplate } from '@/lib/mutations/work_templates';

/**
 * GET /api/work-templates?orgId=...&includeSteps=true&includeArchived=false
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const includeSteps = searchParams.get('includeSteps') === 'true';
  const includeArchived = searchParams.get('includeArchived') === 'true';

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  return await listWorkTemplates({
    orgId: context.data.orgId,
    includeSteps,
    includeArchived,
  });
});

/**
 * POST /api/work-templates
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageTemplates(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await createWorkTemplate({ ...body, orgId: context.data.orgId });
});

/**
 * PATCH /api/work-templates
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageTemplates(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await updateWorkTemplate({ ...body, orgId: context.data.orgId });
});
