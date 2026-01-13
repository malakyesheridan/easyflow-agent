import { and, eq } from 'drizzle-orm';
import { integrations, type NewIntegration } from '@/db/schema/integrations';
import { ok, err, type Result } from '@/lib/result';
import { encryptCredentials } from '@/lib/integrations/crypto';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import {
  integrationUpsertSchema,
  integrationUpdateSchema,
  integrationDeleteSchema,
  type IntegrationUpsertInput,
  type IntegrationUpdateInput,
  type IntegrationDeleteInput,
} from '@/lib/validators/integrations';
import type { IntegrationStatus, IntegrationSummary } from '@/lib/integrations/types';
import { defaultRulesByProvider } from '@/lib/integrations/rules';

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

async function upsertIntegration(params: {
  orgId: string;
  provider: string;
  displayName: string;
  credentials: Record<string, string>;
  rules: unknown[] | null;
  enabled: boolean;
  status: IntegrationStatus;
  lastTestedAt: Date | null;
  lastError: string | null;
}): Promise<Result<IntegrationSummary>> {
  try {
    const encrypted = encryptCredentials(params.credentials);
    const now = new Date();

    const row = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [saved] = await db
        .insert(integrations)
        .values({
          orgId: params.orgId,
          provider: params.provider,
          displayName: params.displayName,
          credentials: encrypted,
          rules: params.rules ?? null,
          enabled: params.enabled,
          status: params.status,
          lastTestedAt: params.lastTestedAt,
          lastError: params.lastError,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [integrations.orgId, integrations.provider],
          set: {
            displayName: params.displayName,
            credentials: encrypted,
            rules: params.rules ?? null,
            enabled: params.enabled,
            status: params.status,
            lastTestedAt: params.lastTestedAt,
            lastError: params.lastError,
            updatedAt: now,
          },
        })
        .returning(integrationSummarySelect);

      return saved ?? null;
    });

    if (!row) return err('INTERNAL_ERROR', 'Failed to save integration');
    return ok(row as IntegrationSummary);
  } catch (error) {
    console.error('Error saving integration:', error);
    return err('INTERNAL_ERROR', 'Failed to save integration', error);
  }
}

export async function saveIntegrationCredentials(
  input: IntegrationUpsertInput
): Promise<Result<IntegrationSummary>> {
  try {
    const validated = integrationUpsertSchema.parse(input);
    const credentials = {
      ...validated.credentials,
      ...(validated.mode ? { mode: validated.mode } : {}),
    };
    const existingRules = await withIntegrationOrgScope(validated.orgId, async (db) => {
      const [row] = await db
        .select({ rules: integrations.rules })
        .from(integrations)
        .where(and(eq(integrations.orgId, validated.orgId), eq(integrations.provider, validated.provider)))
        .limit(1);
      return row?.rules ?? null;
    });

    const rules = Array.isArray(existingRules)
      ? existingRules
      : (defaultRulesByProvider[validated.provider] ?? []);

    return await upsertIntegration({
      orgId: validated.orgId,
      provider: validated.provider,
      displayName: validated.displayName,
      credentials,
      rules,
      enabled: false,
      status: 'disconnected',
      lastTestedAt: null,
      lastError: null,
    });
  } catch (error) {
    console.error('Error validating integration credentials:', error);
    return err('VALIDATION_ERROR', 'Invalid integration payload', error);
  }
}

export async function saveIntegrationTestResult(params: {
  orgId: string;
  provider: string;
  displayName: string;
  credentials: Record<string, string>;
  status: IntegrationStatus;
  lastError?: string | null;
}): Promise<Result<IntegrationSummary>> {
  const existingRules = await withIntegrationOrgScope(params.orgId, async (db) => {
    const [row] = await db
      .select({ rules: integrations.rules })
      .from(integrations)
      .where(and(eq(integrations.orgId, params.orgId), eq(integrations.provider, params.provider)))
      .limit(1);
    return row?.rules ?? null;
  });

  const rules = Array.isArray(existingRules)
    ? existingRules
    : (defaultRulesByProvider[params.provider] ?? []);

  return await upsertIntegration({
    orgId: params.orgId,
    provider: params.provider,
    displayName: params.displayName,
    credentials: params.credentials,
    rules,
    enabled: false,
    status: params.status,
    lastTestedAt: new Date(),
    lastError: params.lastError ?? null,
  });
}

export async function updateIntegration(
  input: IntegrationUpdateInput
): Promise<Result<IntegrationSummary>> {
  try {
    const validated = integrationUpdateSchema.parse(input);
    const now = new Date();

    return await withIntegrationOrgScope(validated.orgId, async (db) => {
      const [current] = await db
        .select({
          id: integrations.id,
          status: integrations.status,
          credentials: integrations.credentials,
          lastTestedAt: integrations.lastTestedAt,
          lastError: integrations.lastError,
        })
        .from(integrations)
        .where(and(eq(integrations.id, validated.id), eq(integrations.orgId, validated.orgId)))
        .limit(1);

      if (!current) return err('NOT_FOUND', 'Integration not found');

      if (validated.enabled === true) {
        const isPreviouslyConnected =
          current.status === 'connected' ||
          (current.status === 'disabled' && Boolean(current.lastTestedAt) && !current.lastError);
        if (!isPreviouslyConnected) {
          return err('VALIDATION_ERROR', 'Integration must be connected before enabling');
        }
        if (!current.credentials) {
          return err('VALIDATION_ERROR', 'Integration credentials are missing');
        }
      }

      const updateData: Partial<NewIntegration> = {
        updatedAt: now,
      };
      if (validated.displayName !== undefined) updateData.displayName = validated.displayName;
      if (validated.rules !== undefined) updateData.rules = validated.rules as any;
      if (validated.enabled !== undefined) {
        updateData.enabled = validated.enabled;
        if (validated.enabled === false) {
          updateData.status = 'disabled';
        }
        if (validated.enabled === true && current.status === 'disabled') {
          updateData.status = 'connected';
        }
      }

      const [row] = await db
        .update(integrations)
        .set(updateData as any)
        .where(and(eq(integrations.id, validated.id), eq(integrations.orgId, validated.orgId)))
        .returning(integrationSummarySelect);

      if (!row) return err('INTERNAL_ERROR', 'Failed to update integration');
      return ok(row as IntegrationSummary);
    });
  } catch (error) {
    console.error('Error updating integration:', error);
    return err('INTERNAL_ERROR', 'Failed to update integration', error);
  }
}

export async function deleteIntegration(
  input: IntegrationDeleteInput
): Promise<Result<{ id: string }>> {
  try {
    const validated = integrationDeleteSchema.parse(input);

    return await withIntegrationOrgScope(validated.orgId, async (db) => {
      const [row] = await db
        .delete(integrations)
        .where(and(eq(integrations.id, validated.id), eq(integrations.orgId, validated.orgId)))
        .returning({ id: integrations.id });

      if (!row) return err('NOT_FOUND', 'Integration not found');
      return ok(row);
    });
  } catch (error) {
    console.error('Error deleting integration:', error);
    return err('INTERNAL_ERROR', 'Failed to delete integration', error);
  }
}

export async function updateIntegrationCredentials(params: {
  orgId: string;
  provider: string;
  credentials: Record<string, string>;
  status?: IntegrationStatus;
  enabled?: boolean;
  lastTestedAt?: Date | null;
  lastError?: string | null;
}): Promise<Result<IntegrationSummary>> {
  try {
    const encrypted = encryptCredentials(params.credentials);
    const now = new Date();

    return await withIntegrationOrgScope(params.orgId, async (db) => {
      const [current] = await db
        .select({
          id: integrations.id,
        })
        .from(integrations)
        .where(and(eq(integrations.orgId, params.orgId), eq(integrations.provider, params.provider)))
        .limit(1);

      if (!current) return err('NOT_FOUND', 'Integration not found');

      const updateData: Partial<NewIntegration> = {
        credentials: encrypted,
        updatedAt: now,
      };
      if (params.status !== undefined) updateData.status = params.status;
      if (params.enabled !== undefined) updateData.enabled = params.enabled;
      if (params.lastTestedAt !== undefined) updateData.lastTestedAt = params.lastTestedAt;
      if (params.lastError !== undefined) updateData.lastError = params.lastError;

      const [row] = await db
        .update(integrations)
        .set(updateData as any)
        .where(eq(integrations.id, current.id))
        .returning(integrationSummarySelect);

      if (!row) return err('INTERNAL_ERROR', 'Failed to update integration');
      return ok(row as IntegrationSummary);
    });
  } catch (error) {
    console.error('Error updating integration credentials:', error);
    return err('INTERNAL_ERROR', 'Failed to update integration credentials', error);
  }
}
