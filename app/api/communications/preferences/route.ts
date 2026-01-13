import { withRoute } from '@/lib/api/withRoute';
import { ok, err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { listCommPreferences } from '@/lib/communications/queries';
import { upsertCommPreference } from '@/lib/communications/mutations';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  return await listCommPreferences({ orgId: context.data.orgId });
});

export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  if (!body?.eventKey) return err('VALIDATION_ERROR', 'eventKey is required');

  return await upsertCommPreference({
    orgId: context.data.orgId,
    eventKey: String(body.eventKey),
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
    enabledEmail: typeof body?.enabledEmail === 'boolean' ? body.enabledEmail : undefined,
    enabledSms: typeof body?.enabledSms === 'boolean' ? body.enabledSms : undefined,
    enabledInApp: typeof body?.enabledInApp === 'boolean' ? body.enabledInApp : undefined,
    sendToAdmins: typeof body?.sendToAdmins === 'boolean' ? body.sendToAdmins : undefined,
    sendToAssignedCrew: typeof body?.sendToAssignedCrew === 'boolean' ? body.sendToAssignedCrew : undefined,
    sendToClientContacts: typeof body?.sendToClientContacts === 'boolean' ? body.sendToClientContacts : undefined,
    sendToSiteContacts: typeof body?.sendToSiteContacts === 'boolean' ? body.sendToSiteContacts : undefined,
    additionalEmails: typeof body?.additionalEmails === 'string' ? body.additionalEmails : undefined,
    deliveryMode: typeof body?.deliveryMode === 'string' ? body.deliveryMode : undefined,
    recipientRules: body?.recipientRules ?? undefined,
    timing: body?.timing ?? undefined,
  });
});
