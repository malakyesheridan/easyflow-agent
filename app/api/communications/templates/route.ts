import { withRoute } from '@/lib/api/withRoute';
import { ok, err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageTemplates } from '@/lib/authz';
import { listCommTemplates } from '@/lib/communications/queries';
import { createCommTemplateVersion, resetCommTemplateToDefault } from '@/lib/communications/mutations';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageTemplates(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const eventKey = searchParams.get('eventKey') || undefined;
  const channel = searchParams.get('channel') || undefined;
  return await listCommTemplates({ orgId: context.data.orgId, eventKey, channel });
});

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageTemplates(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const action = typeof body?.action === 'string' ? body.action : '';
  if (action === 'reset') {
    return await resetCommTemplateToDefault({
      orgId: context.data.orgId,
      templateId: typeof body?.templateId === 'string' ? body.templateId : undefined,
      key: typeof body?.key === 'string' ? body.key : undefined,
      channel: typeof body?.channel === 'string' ? body.channel : undefined,
    });
  }

  if (!body?.name || !body?.body) return err('VALIDATION_ERROR', 'name and body are required');

  const result = await createCommTemplateVersion({
    orgId: context.data.orgId,
    templateId: typeof body?.templateId === 'string' ? body.templateId : undefined,
    key: typeof body?.key === 'string' ? body.key : undefined,
    channel: typeof body?.channel === 'string' ? body.channel : undefined,
    name: String(body.name).trim(),
    subject: typeof body?.subject === 'string' ? body.subject : null,
    body: String(body.body),
    bodyHtml: typeof body?.bodyHtml === 'string' ? body.bodyHtml : null,
  });

  if (!result.ok) return result;
  return ok(result.data);
});
