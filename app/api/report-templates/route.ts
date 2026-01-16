import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { listReportTemplates } from '@/lib/queries/report_templates';
import { createReportTemplate, upsertReportTemplate } from '@/lib/mutations/report_templates';

/**
 * GET /api/report-templates?orgId=...&type=vendor
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const templateType = searchParams.get('type');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await listReportTemplates({ orgId: context.data.orgId, templateType });
});

/**
 * PUT /api/report-templates
 */
export const PUT = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await upsertReportTemplate({ ...body, orgId: context.data.orgId });
});

/**
 * POST /api/report-templates
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await createReportTemplate({ ...body, orgId: context.data.orgId });
});
