import { commTemplates } from '@/db/schema/comm_templates';
import { commPreferences } from '@/db/schema/comm_preferences';
import { commProviderStatus } from '@/db/schema/comm_provider_status';
import { DEFAULT_PREFERENCES, DEFAULT_TEMPLATES } from '@/lib/communications/defaults';
import { renderEmailHtml } from '@/lib/communications/renderer';
import { sql } from 'drizzle-orm';

type DbClient = {
  insert: any;
  select: any;
  execute: any;
};

export async function seedCommDefaults(db: DbClient, orgId: string): Promise<void> {
  if (!orgId) return;

  const templateValues = DEFAULT_TEMPLATES.map((template) => ({
    orgId,
    key: template.key,
    channel: template.channel,
    name: template.name,
    subject: template.subject ?? null,
    body: template.body,
    bodyHtml: template.bodyHtml ?? (template.channel === 'email' ? renderEmailHtml(template.body) : null),
    variablesSchema: template.variablesSchema ?? {},
    isEnabled: template.isEnabled ?? true,
    isSystem: template.isSystem ?? true,
    version: template.version ?? 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  if (templateValues.length > 0) {
    await db
      .insert(commTemplates)
      .values(templateValues)
      .onConflictDoNothing({ target: [commTemplates.orgId, commTemplates.key, commTemplates.channel, commTemplates.version] });
  }

  const preferenceValues = DEFAULT_PREFERENCES.map((preference) => {
    const recipientRules = preference.recipientRules ?? {};
    const toRoles = Array.isArray((recipientRules as any).to_roles) ? (recipientRules as any).to_roles : [];
    const hasAdminRole = toRoles.some((role: string) => ['admin', 'manager'].includes(String(role).toLowerCase()));
    return {
      orgId,
      eventKey: preference.eventKey,
      enabled: preference.enabled ?? true,
      enabledEmail: preference.enabledEmail ?? true,
      enabledSms: preference.enabledSms ?? false,
      enabledInApp: preference.enabledInApp ?? true,
      sendToAdmins: preference.sendToAdmins ?? hasAdminRole,
      sendToAssignedCrew: preference.sendToAssignedCrew ?? Boolean((recipientRules as any).to_assigned_staff),
      sendToClientContacts: preference.sendToClientContacts ?? Boolean((recipientRules as any).to_client),
      sendToSiteContacts: preference.sendToSiteContacts ?? Boolean((recipientRules as any).to_site_contacts),
      additionalEmails: preference.additionalEmails ?? null,
      deliveryMode: preference.deliveryMode ?? null,
      recipientRules,
      timing: preference.timing ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  if (preferenceValues.length > 0) {
    await db
      .insert(commPreferences)
      .values(preferenceValues)
      .onConflictDoNothing({ target: [commPreferences.orgId, commPreferences.eventKey] });
  }

  await db
    .insert(commProviderStatus)
    .values({
      orgId,
      emailProvider: 'resend',
      emailEnabled: Boolean(process.env.RESEND_API_KEY),
      smsProvider: 'stub',
      smsEnabled: false,
    })
    .onConflictDoNothing({ target: [commProviderStatus.orgId] });
}

export async function hasCommDefaults(db: DbClient, orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commTemplates)
    .where(sql`${commTemplates.orgId} = ${orgId}`);
  return Number(row?.count ?? 0) > 0;
}
