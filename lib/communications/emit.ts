import { commEvents } from '@/db/schema/comm_events';
import { planCommMessages } from '@/lib/communications/planner';
import { withCommOrgScope } from '@/lib/communications/scope';
import type { CommEventInput } from '@/lib/communications/types';

export async function emitCommEvent(input: CommEventInput): Promise<string | null> {
  const orgId = input.orgId;
  if (!orgId) return null;

  return await withCommOrgScope(
    { orgId, userId: input.triggeredByUserId ?? null, roleKey: input.actorRoleKey ?? 'system' },
    async (db) => {
      const [row] = await db
        .insert(commEvents)
        .values({
          orgId,
          eventKey: input.eventKey,
          entityType: input.entityType,
          entityId: input.entityId,
          triggeredByUserId: input.triggeredByUserId ?? null,
          source: input.source ?? 'app',
          payload: input.payload ?? {},
          createdAt: new Date(),
        })
        .returning({ id: commEvents.id });

      const eventId = row?.id ?? null;
      if (!eventId) return null;

      await planCommMessages({
        db,
        event: {
          id: eventId,
          orgId,
          eventKey: input.eventKey,
          entityType: input.entityType,
          entityId: input.entityId,
          triggeredByUserId: input.triggeredByUserId ?? null,
          payload: input.payload ?? {},
        },
      });

      return eventId;
    }
  );
}
