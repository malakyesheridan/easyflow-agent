import { withRoute } from '@/lib/api/withRoute';
import { ok, err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { getCommProviderStatus } from '@/lib/communications/queries';
import { updateCommProviderStatus } from '@/lib/communications/mutations';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { commOutbox } from '@/db/schema/comm_outbox';
import { withCommOrgScope } from '@/lib/communications/scope';
import { dispatchDueCommMessages, emitCommEvent } from '@/lib/communications';
import { getAllowedFromDomains, getDefaultSenderIdentity, isValidEmail, resolveSenderIdentity } from '@/lib/communications/sender';
import { and, desc, eq } from 'drizzle-orm';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const [statusResult, settingsResult] = await Promise.all([
    getCommProviderStatus({ orgId: context.data.orgId }),
    getOrgSettings({ orgId: context.data.orgId }),
  ]);
  if (!statusResult.ok) return statusResult;
  if (!settingsResult.ok) return settingsResult;

  const status = statusResult.data;
  const settings = settingsResult.data;
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const defaults = getDefaultSenderIdentity();
  const allowedFromDomains = getAllowedFromDomains();
  const senderIdentity = resolveSenderIdentity({
    orgName: context.data.session.org.name,
    commFromName: settings?.commFromName ?? null,
    commFromEmail: settings?.commFromEmail ?? null,
    commReplyToEmail: settings?.commReplyToEmail ?? null,
  });

  return ok({
    emailProvider: status?.emailProvider ?? 'resend',
    emailEnabled: status?.emailEnabled ?? false,
    smsProvider: status?.smsProvider ?? 'stub',
    smsEnabled: status?.smsEnabled ?? false,
    lastTestedAt: status?.lastTestedAt ?? null,
    lastTestResult: status?.lastTestResult ?? null,
    resendConfigured,
    allowedFromDomains,
    defaultFromName: defaults.fromName,
    defaultFromEmail: defaults.fromEmail,
    defaultReplyTo: defaults.replyTo,
    senderIdentity,
    commFromName: settings?.commFromName ?? null,
    commFromEmail: settings?.commFromEmail ?? null,
    commReplyToEmail: settings?.commReplyToEmail ?? null,
  });
});

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const action = typeof body?.action === 'string' ? body.action : '';
  if (action !== 'test-email') return err('VALIDATION_ERROR', 'Unsupported action');

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  if (!to || !isValidEmail(to)) return err('VALIDATION_ERROR', 'A valid destination email is required');

  const eventKey = typeof body?.eventKey === 'string' && body.eventKey.trim() ? body.eventKey.trim() : 'system_test_email';
  const payloadOverride = body?.payload && typeof body.payload === 'object' ? body.payload : {};

  const eventId = await emitCommEvent({
    orgId: context.data.orgId,
    eventKey,
    entityType: 'system',
    entityId: context.data.orgId,
    triggeredByUserId: context.data.actor.userId ?? null,
    source: 'app',
    payload: {
      ...payloadOverride,
      recipients: [
        {
          type: 'custom',
          email: to,
          name: to,
        },
      ],
      forceChannels: ['email'],
      testSend: true,
    },
    actorRoleKey: 'system',
  });

  if (!eventId) return err('INTERNAL_ERROR', 'Failed to queue test email');

  await dispatchDueCommMessages({ orgId: context.data.orgId, limit: 25 });

  const now = new Date();
  const [row] = await withCommOrgScope({ orgId: context.data.orgId, roleKey: 'system' }, async (db) => {
    const rows = await db
      .select()
      .from(commOutbox)
      .where(and(eq(commOutbox.orgId, context.data.orgId), eq(commOutbox.eventId, eventId), eq(commOutbox.recipientEmail, to)))
      .orderBy(desc(commOutbox.createdAt))
      .limit(1);
    return rows;
  });

  if (!row) {
    return err('INTEGRATION_TEST_FAILED', 'Test email was not queued. Check template and preferences.');
  }

  const status = row?.status ?? 'queued';
  const providerMessageId = row?.providerMessageId ?? null;
  const errorMessage = row?.error ?? null;

  await updateCommProviderStatus({
    orgId: context.data.orgId,
    emailEnabled: status === 'sent',
    lastTestedAt: now,
    lastTestResult: status === 'sent' ? { ok: true, providerMessageId } : { ok: false, error: errorMessage },
  });

  if (status === 'failed' || status === 'suppressed') {
    return err('INTEGRATION_TEST_FAILED', errorMessage ?? 'Test email failed');
  }

  return ok({ status, outboxId: row?.id ?? null });
});
