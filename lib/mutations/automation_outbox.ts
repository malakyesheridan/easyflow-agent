import { and, eq, inArray } from 'drizzle-orm';
import { automationActionsOutbox } from '@/db/schema/automation_actions_outbox';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { ok, err, type Result } from '@/lib/result';

/**
 * Re-queues a failed automation action.
 */
export async function retryAutomationAction(params: {
  orgId: string;
  outboxId: string;
}): Promise<Result<{ updatedCount: number }>> {
  try {
    const now = new Date();
    return await withAutomationOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const result = await db
        .update(automationActionsOutbox)
        .set({
          status: 'queued',
          attempts: 0,
          lastError: null,
          nextAttemptAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(automationActionsOutbox.orgId, params.orgId),
            eq(automationActionsOutbox.id, params.outboxId),
            inArray(automationActionsOutbox.status, ['dead', 'failed'])
          )
        );

      return ok({ updatedCount: (result as unknown as { rowCount?: number }).rowCount ?? 0 });
    });
  } catch (error) {
    console.error('Error retrying automation action:', error);
    return err('INTERNAL_ERROR', 'Failed to retry automation action', error);
  }
}
