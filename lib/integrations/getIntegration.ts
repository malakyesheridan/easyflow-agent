import { and, eq } from 'drizzle-orm';
import { integrations } from '@/db/schema/integrations';
import { decryptCredentials } from '@/lib/integrations/crypto';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import type { IntegrationCredentials, IntegrationStatus } from '@/lib/integrations/types';

export type IntegrationAccess = {
  enabled: boolean;
  status: IntegrationStatus;
  credentials?: IntegrationCredentials;
  integrationId?: string;
  provider: string;
  displayName?: string;
  lastTestedAt?: Date | null;
  lastError?: string | null;
};

export async function getIntegration(orgId: string, provider: string): Promise<IntegrationAccess> {
  return await withIntegrationOrgScope(orgId, async (db) => {
    const [row] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, provider)))
      .limit(1);

    if (!row) {
      return { enabled: false, status: 'disconnected', provider };
    }

    if (!row.enabled) {
      return {
        enabled: false,
        status: row.status ?? 'disconnected',
        provider,
        integrationId: row.id,
        displayName: row.displayName,
        lastTestedAt: row.lastTestedAt ?? null,
        lastError: row.lastError ?? null,
      };
    }

    if (!row.credentials) {
      throw new Error(`Integration ${provider} is enabled but has no credentials.`);
    }

    const credentials = decryptCredentials(row.credentials);

    return {
      enabled: true,
      status: row.status ?? 'connected',
      provider,
      integrationId: row.id,
      displayName: row.displayName,
      credentials,
      lastTestedAt: row.lastTestedAt ?? null,
      lastError: row.lastError ?? null,
    };
  });
}
