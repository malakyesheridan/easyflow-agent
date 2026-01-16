import { z } from 'zod';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { followupSnoozes } from '@/db/schema/followup_snoozes';

const snoozeSchema = z.object({
  orgId: z.string().trim().min(1),
  source_type: z.string().trim().min(1),
  source_id: z.string().trim().min(1),
  snoozed_until: z.string().trim().min(1),
});

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = snoozeSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;

  const snoozedUntil = new Date(parsed.data.snoozed_until);
  if (Number.isNaN(snoozedUntil.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid snooze date');
  }

  const now = new Date();
  const db = getDb();
  const [row] = await db
    .insert(followupSnoozes)
    .values({
      orgId: context.data.orgId,
      sourceType: parsed.data.source_type,
      sourceId: parsed.data.source_id,
      snoozedUntil,
      createdByUserId: context.data.actor.userId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [followupSnoozes.orgId, followupSnoozes.sourceType, followupSnoozes.sourceId],
      set: {
        snoozedUntil,
        updatedAt: now,
        createdByUserId: context.data.actor.userId ?? null,
      },
    })
    .returning();

  return ok({
    id: row?.id ? String(row.id) : null,
    snoozedUntil: snoozedUntil.toISOString(),
  });
});
