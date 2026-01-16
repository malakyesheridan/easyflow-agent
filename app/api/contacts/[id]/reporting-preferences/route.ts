import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { contactReportingPreferences } from '@/db/schema/contact_reporting_preferences';

const patchSchema = z.object({
  orgId: z.string().trim().min(1),
  cadencePreference: z.enum(['weekly', 'fortnightly', 'monthly', 'custom', 'none']).optional(),
  channelPreference: z.string().trim().min(1).max(40).nullable().optional(),
  additionalRecipients: z.array(z.string().trim().min(1).max(120)).optional(),
});

export const GET = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const contactId = context?.params?.id;
  if (!contactId) return err('VALIDATION_ERROR', 'Contact id is required');
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const [row] = await db
    .select()
    .from(contactReportingPreferences)
    .where(and(eq(contactReportingPreferences.orgId, orgContext.data.orgId), eq(contactReportingPreferences.contactId, contactId)))
    .limit(1);

  return ok({
    cadencePreference: row?.cadencePreference ?? 'none',
    channelPreference: row?.channelPreference ?? null,
    additionalRecipients: (row?.additionalRecipientsJson as string[] | null) ?? [],
  });
});

export const PATCH = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const contactId = context?.params?.id;
  if (!contactId) return err('VALIDATION_ERROR', 'Contact id is required');
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(contactReportingPreferences)
    .where(and(eq(contactReportingPreferences.orgId, orgContext.data.orgId), eq(contactReportingPreferences.contactId, contactId)))
    .limit(1);

  const values = {
    orgId: orgContext.data.orgId,
    contactId,
    cadencePreference: parsed.data.cadencePreference ?? existing?.cadencePreference ?? 'none',
    channelPreference: parsed.data.channelPreference ?? existing?.channelPreference ?? null,
    additionalRecipientsJson: parsed.data.additionalRecipients ?? (existing?.additionalRecipientsJson as string[] | null) ?? [],
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(contactReportingPreferences)
      .set(values)
      .where(and(eq(contactReportingPreferences.orgId, orgContext.data.orgId), eq(contactReportingPreferences.contactId, contactId)));
  } else {
    await db.insert(contactReportingPreferences).values({ ...values, createdAt: new Date() });
  }

  return ok({
    cadencePreference: values.cadencePreference,
    channelPreference: values.channelPreference,
    additionalRecipients: values.additionalRecipientsJson,
  });
});
