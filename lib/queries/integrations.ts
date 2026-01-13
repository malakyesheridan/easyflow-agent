import { and, asc, eq } from 'drizzle-orm';
import { integrations } from '@/db/schema/integrations';
import { ok, err, type Result } from '@/lib/result';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import type { IntegrationSummary } from '@/lib/integrations/types';

const integrationSummarySelect = {
  id: integrations.id,
  orgId: integrations.orgId,
  provider: integrations.provider,
  displayName: integrations.displayName,
  enabled: integrations.enabled,
  status: integrations.status,
  lastTestedAt: integrations.lastTestedAt,
  lastError: integrations.lastError,
  rules: integrations.rules,
  createdAt: integrations.createdAt,
  updatedAt: integrations.updatedAt,
};

export async function listIntegrations(params: {
  orgId: string;
}): Promise<Result<IntegrationSummary[]>> {
  try {
    const rows = await withIntegrationOrgScope(params.orgId, async (db) => {
      return await db
        .select(integrationSummarySelect)
        .from(integrations)
        .where(eq(integrations.orgId, params.orgId))
        .orderBy(asc(integrations.displayName));
    });

    return ok(rows as IntegrationSummary[]);
  } catch (error) {
    console.error('Error listing integrations:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch integrations', error);
  }
}

export async function listEnabledIntegrations(params: {
  orgId: string;
}): Promise<Result<IntegrationSummary[]>> {
  try {
    const rows = await withIntegrationOrgScope(params.orgId, async (db) => {
      return await db
        .select(integrationSummarySelect)
        .from(integrations)
        .where(and(eq(integrations.orgId, params.orgId), eq(integrations.enabled, true)))
        .orderBy(asc(integrations.displayName));
    });

    return ok(rows as IntegrationSummary[]);
  } catch (error) {
    console.error('Error listing enabled integrations:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch enabled integrations', error);
  }
}

export async function getIntegrationById(params: {
  orgId: string;
  id: string;
}): Promise<Result<IntegrationSummary | null>> {
  try {
    const [row] = await withIntegrationOrgScope(params.orgId, async (db) => {
      return await db
        .select(integrationSummarySelect)
        .from(integrations)
        .where(and(eq(integrations.id, params.id), eq(integrations.orgId, params.orgId)))
        .limit(1);
    });

    return ok((row ?? null) as IntegrationSummary | null);
  } catch (error) {
    console.error('Error getting integration:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch integration', error);
  }
}
