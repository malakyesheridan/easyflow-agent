import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { reportTemplates } from '@/db/schema/report_templates';
import { updateReportTemplate, deleteReportTemplate } from '@/lib/mutations/report_templates';

export const GET = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const templateId = context?.params?.id;
  if (!templateId) return err('VALIDATION_ERROR', 'Template id is required');
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;
  if (!canManageOrgSettings(orgContext.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const db = getDb();
  const [row] = await db
    .select()
    .from(reportTemplates)
    .where(and(eq(reportTemplates.orgId, orgContext.data.orgId), eq(reportTemplates.id, templateId)))
    .limit(1);

  if (!row) return err('NOT_FOUND', 'Template not found');
  return ok(row);
});

export const PATCH = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const templateId = context?.params?.id;
  if (!templateId) return err('VALIDATION_ERROR', 'Template id is required');
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;
  if (!canManageOrgSettings(orgContext.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await updateReportTemplate(templateId, { ...body, orgId: orgContext.data.orgId });
});

export const DELETE = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const templateId = context?.params?.id;
  if (!templateId) return err('VALIDATION_ERROR', 'Template id is required');
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;
  if (!canManageOrgSettings(orgContext.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await deleteReportTemplate(templateId, orgContext.data.orgId);
});
