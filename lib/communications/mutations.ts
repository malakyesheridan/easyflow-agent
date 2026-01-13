import { and, eq, sql } from 'drizzle-orm';
import { withCommOrgScope } from '@/lib/communications/scope';
import { commTemplates } from '@/db/schema/comm_templates';
import { commPreferences } from '@/db/schema/comm_preferences';
import { commProviderStatus } from '@/db/schema/comm_provider_status';
import { DEFAULT_TEMPLATES } from '@/lib/communications/defaults';
import { renderEmailHtml } from '@/lib/communications/renderer';
import { ok, err, type Result } from '@/lib/result';

export async function createCommTemplateVersion(params: {
  orgId: string;
  templateId?: string;
  key?: string;
  channel?: string;
  name: string;
  subject?: string | null;
  body: string;
  bodyHtml?: string | null;
  isEnabled?: boolean;
  isSystem?: boolean;
  variablesSchema?: Record<string, unknown>;
}): Promise<Result<any>> {
  try {
    return await withCommOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      let key = params.key ?? null;
      let channel = params.channel ?? null;
      let isSystem = params.isSystem ?? false;

      if (params.templateId) {
        const [existing] = await db
          .select()
          .from(commTemplates)
          .where(and(eq(commTemplates.orgId, params.orgId), eq(commTemplates.id, params.templateId)))
          .limit(1);
        if (!existing) return err('NOT_FOUND', 'Template not found');
        key = existing.key;
        channel = existing.channel;
        isSystem = existing.isSystem;
      }

      if (!key || !channel) return err('VALIDATION_ERROR', 'key and channel are required');

      const resolvedBodyHtml =
        channel === 'email' ? params.bodyHtml ?? renderEmailHtml(params.body) : params.bodyHtml ?? null;

      const [row] = await db
        .select({ maxVersion: sql<number>`max(${commTemplates.version})` })
        .from(commTemplates)
        .where(and(eq(commTemplates.orgId, params.orgId), eq(commTemplates.key, key), eq(commTemplates.channel, channel)))
        .limit(1);

      const nextVersion = Number(row?.maxVersion ?? 0) + 1;

      const [created] = await db
        .insert(commTemplates)
        .values({
          orgId: params.orgId,
          key,
          channel,
          name: params.name,
          subject: params.subject ?? null,
          body: params.body,
          bodyHtml: resolvedBodyHtml,
          variablesSchema: params.variablesSchema ?? {},
          isEnabled: params.isEnabled ?? true,
          isSystem,
          version: nextVersion,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!created) return err('INTERNAL_ERROR', 'Failed to create template version');
      return ok(created);
    });
  } catch (error) {
    console.error('Error creating comm template version:', error);
    return err('INTERNAL_ERROR', 'Failed to create template', error);
  }
}

export async function upsertCommPreference(params: {
  orgId: string;
  eventKey: string;
  enabled?: boolean;
  enabledEmail?: boolean;
  enabledSms?: boolean;
  enabledInApp?: boolean;
  sendToAdmins?: boolean;
  sendToAssignedCrew?: boolean;
  sendToClientContacts?: boolean;
  sendToSiteContacts?: boolean;
  additionalEmails?: string | null;
  deliveryMode?: string | null;
  recipientRules?: Record<string, unknown>;
  timing?: Record<string, unknown>;
}): Promise<Result<any>> {
  try {
    return await withCommOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const now = new Date();
      const deliveryMode =
        params.deliveryMode === 'digest' ? 'digest' : params.deliveryMode === 'instant' ? 'instant' : undefined;
      const values = {
        orgId: params.orgId,
        eventKey: params.eventKey,
        enabled: params.enabled ?? true,
        enabledEmail: params.enabledEmail ?? true,
        enabledSms: params.enabledSms ?? false,
        enabledInApp: params.enabledInApp ?? true,
        sendToAdmins: params.sendToAdmins ?? undefined,
        sendToAssignedCrew: params.sendToAssignedCrew ?? undefined,
        sendToClientContacts: params.sendToClientContacts ?? undefined,
        sendToSiteContacts: params.sendToSiteContacts ?? undefined,
        additionalEmails: params.additionalEmails ?? undefined,
        deliveryMode,
        recipientRules: params.recipientRules ?? {},
        timing: params.timing ?? {},
        createdAt: now,
        updatedAt: now,
      };

      const [row] = await db
        .insert(commPreferences)
        .values(values)
        .onConflictDoUpdate({
          target: [commPreferences.orgId, commPreferences.eventKey],
          set: { ...values, updatedAt: now },
        })
        .returning();

      if (!row) return err('INTERNAL_ERROR', 'Failed to save preference');
      return ok(row);
    });
  } catch (error) {
    console.error('Error upserting comm preference:', error);
    return err('INTERNAL_ERROR', 'Failed to save preference', error);
  }
}

export async function updateCommProviderStatus(params: {
  orgId: string;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  emailProvider?: string | null;
  smsProvider?: string | null;
  lastTestedAt?: Date | null;
  lastTestResult?: Record<string, unknown> | null;
}): Promise<Result<any>> {
  try {
    return await withCommOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const [row] = await db
        .insert(commProviderStatus)
        .values({
          orgId: params.orgId,
          emailEnabled: params.emailEnabled ?? undefined,
          smsEnabled: params.smsEnabled ?? undefined,
          emailProvider: params.emailProvider ?? undefined,
          smsProvider: params.smsProvider ?? undefined,
          lastTestedAt: params.lastTestedAt ?? undefined,
          lastTestResult: params.lastTestResult ?? undefined,
        })
        .onConflictDoUpdate({
          target: [commProviderStatus.orgId],
          set: {
            emailEnabled: params.emailEnabled ?? undefined,
            smsEnabled: params.smsEnabled ?? undefined,
            emailProvider: params.emailProvider ?? undefined,
            smsProvider: params.smsProvider ?? undefined,
            lastTestedAt: params.lastTestedAt ?? undefined,
            lastTestResult: params.lastTestResult ?? undefined,
          },
        })
        .returning();

      if (!row) return err('INTERNAL_ERROR', 'Failed to update provider status');
      return ok(row);
    });
  } catch (error) {
    console.error('Error updating comm provider status:', error);
    return err('INTERNAL_ERROR', 'Failed to update provider status', error);
  }
}

export async function resetCommTemplateToDefault(params: {
  orgId: string;
  templateId?: string;
  key?: string;
  channel?: string;
}): Promise<Result<any>> {
  try {
    return await withCommOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      let key = params.key ?? null;
      let channel = params.channel ?? null;

      if (params.templateId) {
        const [existing] = await db
          .select()
          .from(commTemplates)
          .where(and(eq(commTemplates.orgId, params.orgId), eq(commTemplates.id, params.templateId)))
          .limit(1);
        if (!existing) return err('NOT_FOUND', 'Template not found');
        key = existing.key;
        channel = existing.channel;
      }

      if (!key || !channel) return err('VALIDATION_ERROR', 'key and channel are required');

      const defaults = DEFAULT_TEMPLATES.find((template) => template.key === key && template.channel === channel);
      if (!defaults) return err('NOT_FOUND', 'Default template not found');

      return await createCommTemplateVersion({
        orgId: params.orgId,
        key,
        channel,
        name: defaults.name,
        subject: defaults.subject ?? null,
        body: defaults.body,
        bodyHtml: defaults.bodyHtml ?? (defaults.channel === 'email' ? renderEmailHtml(defaults.body) : null),
        variablesSchema: defaults.variablesSchema ?? {},
        isEnabled: defaults.isEnabled ?? true,
        isSystem: defaults.isSystem ?? true,
      });
    });
  } catch (error) {
    console.error('Error resetting comm template:', error);
    return err('INTERNAL_ERROR', 'Failed to reset template', error);
  }
}
