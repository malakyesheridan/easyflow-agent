import { and, desc, eq, sql } from 'drizzle-orm';
import { integrationEvents } from '@/db/schema/integration_events';
import { integrations } from '@/db/schema/integrations';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { ok, err, type Result } from '@/lib/result';

export type IntegrationEventSummary = {
  id: string;
  integrationId: string;
  provider: string;
  displayName: string;
  eventType: string;
  actionType: string;
  status: string;
  attemptCount: number;
  latencyMs: number | null;
  error: string | null;
  response: unknown;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export async function listIntegrationEvents(params: {
  orgId: string;
  provider?: string;
  integrationId?: string;
  eventType?: string;
  actionType?: string;
  status?: string;
  jobId?: string;
  limit?: number;
}): Promise<Result<IntegrationEventSummary[]>> {
  try {
    const limit = params.limit ?? 50;

    const rows = await withIntegrationOrgScope(params.orgId, async (db) => {
      const conditions = [];
      if (params.integrationId) {
        conditions.push(eq(integrationEvents.integrationId, params.integrationId));
      }
      if (params.provider) {
        conditions.push(eq(integrations.provider, params.provider));
      }
      if (params.eventType) {
        conditions.push(eq(integrationEvents.eventType, params.eventType));
      }
      if (params.actionType) {
        conditions.push(eq(integrationEvents.actionType, params.actionType));
      }
      if (params.status) {
        conditions.push(eq(integrationEvents.status, params.status));
      }
      if (params.jobId) {
        conditions.push(
          sql`COALESCE(${integrationEvents.payload} -> 'event' ->> 'jobId', ${integrationEvents.payload} ->> 'jobId') = ${params.jobId}`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : null;

      const baseQuery = db
        .select({
          id: integrationEvents.id,
          integrationId: integrationEvents.integrationId,
          provider: integrations.provider,
          displayName: integrations.displayName,
          eventType: integrationEvents.eventType,
          actionType: integrationEvents.actionType,
          status: integrationEvents.status,
          attemptCount: integrationEvents.attemptCount,
          latencyMs: integrationEvents.latencyMs,
          error: integrationEvents.error,
          response: integrationEvents.response,
          payload: integrationEvents.payload,
          createdAt: integrationEvents.createdAt,
          updatedAt: integrationEvents.updatedAt,
        })
        .from(integrationEvents)
        .innerJoin(integrations, eq(integrationEvents.integrationId, integrations.id));

      const query = whereClause ? baseQuery.where(whereClause) : baseQuery;
      return await query.orderBy(desc(integrationEvents.createdAt)).limit(limit);
    });

    return ok(rows as IntegrationEventSummary[]);
  } catch (error) {
    console.error('Error listing integration events:', error);
    return err('INTERNAL_ERROR', 'Failed to list integration events', error);
  }
}
