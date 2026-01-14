import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { contactActivities } from '@/db/schema/contact_activities';
import { contacts } from '@/db/schema/contacts';

const activityTypes = ['note', 'call', 'email', 'sms', 'report_sent'] as const;

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  type: z.enum(activityTypes),
  content: z.string().trim().optional(),
  occurredAt: z.string().datetime().optional(),
  nextTouchAt: z.string().datetime().optional(),
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const GET = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const contactId = context?.params?.id;
  if (!contactId) {
    return err('VALIDATION_ERROR', 'Contact id is required');
  }
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));

  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const rows = await db
    .select({
      id: contactActivities.id,
      type: contactActivities.type,
      content: contactActivities.content,
      occurredAt: contactActivities.occurredAt,
      createdByUserId: contactActivities.createdByUserId,
      createdAt: contactActivities.createdAt,
    })
    .from(contactActivities)
    .where(and(eq(contactActivities.orgId, orgContext.data.orgId), eq(contactActivities.contactId, contactId)))
    .orderBy(desc(contactActivities.occurredAt))
    .limit(limit);

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      type: row.type,
      content: row.content ?? null,
      occurredAt: row.occurredAt?.toISOString?.() ?? null,
      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
      createdAt: row.createdAt?.toISOString?.() ?? null,
    }))
  );
});

export const POST = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const contactId = context?.params?.id;
  if (!contactId) {
    return err('VALIDATION_ERROR', 'Contact id is required');
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const occurredAt = parseDate(parsed.data.occurredAt ?? null) ?? new Date();
  const nextTouchAt = parseDate(parsed.data.nextTouchAt ?? null);
  const db = getDb();

  const [inserted] = await db
    .insert(contactActivities)
    .values({
      orgId: orgContext.data.orgId,
      contactId,
      type: parsed.data.type,
      content: parsed.data.content ?? null,
      occurredAt,
      createdByUserId: orgContext.data.actor.userId ?? null,
      createdAt: new Date(),
    })
    .returning({ id: contactActivities.id });

  if (!inserted?.id) {
    return err('INTERNAL_ERROR', 'Failed to add activity');
  }

  await db
    .update(contacts)
    .set({
      lastTouchAt: occurredAt,
      nextTouchAt: nextTouchAt ?? undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.orgId, orgContext.data.orgId), eq(contacts.id, contactId)));

  return ok({ id: String(inserted.id) });
});
