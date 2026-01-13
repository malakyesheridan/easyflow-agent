import { appEvents } from '@/db/schema/app_events';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { validateAppEventPayload, type AppEventType } from '@/lib/integrations/events/types';
import { err, ok, type Result } from '@/lib/result';
import type { AppEvent } from '@/db/schema/app_events';
import { processAppEventNow } from '@/lib/integrations/events/processor';
import { processAutomationEventNow } from '@/lib/automations/engine';
import { processAutomationRuleEventNow } from '@/lib/automationRules/engine';

export async function emitAppEvent(params: {
  orgId: string;
  eventType: AppEventType;
  payload: unknown;
  actorUserId?: string | null;
}): Promise<Result<AppEvent>> {
  try {
    const validated = validateAppEventPayload(params.eventType, params.payload);
    const now = new Date();

    const row = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [inserted] = await db
        .insert(appEvents)
        .values({
          orgId: params.orgId,
          eventType: params.eventType,
          payload: validated,
          status: 'queued',
          actorUserId: params.actorUserId ?? null,
          createdAt: now,
        })
        .returning();
      return inserted ?? null;
    });

    if (!row) return err('INTERNAL_ERROR', 'Failed to emit app event');

    void processAppEventNow(params.orgId, row.id);
    void processAutomationEventNow(params.orgId, row.id);
    void processAutomationRuleEventNow(params.orgId, row.id);
    return ok(row);
  } catch (error) {
    console.error('Error emitting app event:', {
      eventType: params.eventType,
      orgId: params.orgId,
      error,
    });
    return err('INTERNAL_ERROR', 'Failed to emit app event', error);
  }
}
