import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ok, err, type Result } from '@/lib/result';
import { signalEvents, type SignalEvent } from '@/db/schema/signal_events';
import {
  signalEventAcknowledgeSchema,
  signalEventAssignSchema,
  signalEventResolveSchema,
  type AcknowledgeSignalEventInput,
  type AssignSignalEventInput,
  type ResolveSignalEventInput,
} from '@/lib/validators/signal_events';

export async function acknowledgeSignalEvent(input: AcknowledgeSignalEventInput): Promise<Result<SignalEvent>> {
  try {
    const validated = signalEventAcknowledgeSchema.parse(input);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(signalEvents)
      .where(and(eq(signalEvents.orgId, validated.orgId), eq(signalEvents.id, validated.signalEventId)))
      .limit(1);

    if (!existing) return err('NOT_FOUND', 'Signal event not found');
    if (existing.status === 'resolved') return ok(existing);

    const [updated] = await db
      .update(signalEvents)
      .set({
        status: 'acknowledged',
        acknowledgedBy: validated.acknowledgedByUserId ?? existing.acknowledgedBy ?? null,
        acknowledgedAt: new Date(),
      })
      .where(and(eq(signalEvents.orgId, validated.orgId), eq(signalEvents.id, validated.signalEventId)))
      .returning();

    return updated ? ok(updated) : err('NOT_FOUND', 'Signal event not found');
  } catch (error) {
    console.error('Error acknowledging signal event:', error);
    return err('INTERNAL_ERROR', 'Failed to acknowledge signal event', error);
  }
}

export async function assignSignalEvent(input: AssignSignalEventInput): Promise<Result<SignalEvent>> {
  try {
    const validated = signalEventAssignSchema.parse(input);
    const db = getDb();
    const [updated] = await db
      .update(signalEvents)
      .set({
        assignedTo: validated.assignedToUserId ?? null,
      })
      .where(and(eq(signalEvents.orgId, validated.orgId), eq(signalEvents.id, validated.signalEventId)))
      .returning();

    if (!updated) return err('NOT_FOUND', 'Signal event not found');
    return ok(updated);
  } catch (error) {
    console.error('Error assigning signal event:', error);
    return err('INTERNAL_ERROR', 'Failed to assign signal event', error);
  }
}

export async function resolveSignalEvent(input: ResolveSignalEventInput): Promise<Result<SignalEvent>> {
  try {
    const validated = signalEventResolveSchema.parse(input);
    const db = getDb();
    const [updated] = await db
      .update(signalEvents)
      .set({
        status: 'resolved',
        resolvedBy: validated.resolvedByUserId ?? null,
        resolvedAt: new Date(),
        resolutionReason: validated.resolutionReason,
        notes: validated.notes ?? null,
      })
      .where(and(eq(signalEvents.orgId, validated.orgId), eq(signalEvents.id, validated.signalEventId)))
      .returning();

    if (!updated) return err('NOT_FOUND', 'Signal event not found');
    return ok(updated);
  } catch (error) {
    console.error('Error resolving signal event:', error);
    return err('INTERNAL_ERROR', 'Failed to resolve signal event', error);
  }
}
