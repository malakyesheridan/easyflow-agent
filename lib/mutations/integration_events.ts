import { and, eq, inArray } from 'drizzle-orm';
import { integrationEvents } from '@/db/schema/integration_events';
import { integrations } from '@/db/schema/integrations';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { ok, err, type Result } from '@/lib/result';

export async function retryIntegrationEvents(params: {
  orgId: string;
  ids?: string[];
  provider?: string;
  integrationId?: string;
}): Promise<Result<{ updatedCount: number }>> {
  try {
    const updatedCount = await withIntegrationOrgScope(params.orgId, async (db) => {
      let targetIntegrationIds: string[] | null = null;
      if (params.provider) {
        const rows = await db
          .select({ id: integrations.id })
          .from(integrations)
          .where(and(eq(integrations.orgId, params.orgId), eq(integrations.provider, params.provider)));
        targetIntegrationIds = rows.map((row) => row.id);
        if (targetIntegrationIds.length === 0) {
          return 0;
        }
      } else if (params.integrationId) {
        targetIntegrationIds = [params.integrationId];
      }

      const conditions = [eq(integrationEvents.status, 'failed')];
      if (params.ids && params.ids.length > 0) {
        conditions.push(inArray(integrationEvents.id, params.ids));
      }
      if (targetIntegrationIds && targetIntegrationIds.length > 0) {
        conditions.push(inArray(integrationEvents.integrationId, targetIntegrationIds));
      }

      const result = await db
        .update(integrationEvents)
        .set({
          status: 'queued',
          attemptCount: 0,
          error: null,
          updatedAt: new Date(),
        } as any)
        .where(and(...conditions));

      return (result as any)?.rowCount ?? 0;
    });

    return ok({ updatedCount });
  } catch (error) {
    console.error('Error retrying integration events:', error);
    return err('INTERNAL_ERROR', 'Failed to retry integration events', error);
  }
}
