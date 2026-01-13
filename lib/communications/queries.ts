import { and, desc, eq, gte, ilike, lte } from 'drizzle-orm';
import { withCommOrgScope } from '@/lib/communications/scope';
import { commTemplates } from '@/db/schema/comm_templates';
import { commPreferences } from '@/db/schema/comm_preferences';
import { commOutbox } from '@/db/schema/comm_outbox';
import { commProviderStatus } from '@/db/schema/comm_provider_status';
import { ok, err, type Result } from '@/lib/result';

export async function listCommTemplates(params: {
  orgId: string;
  eventKey?: string;
  channel?: string;
}): Promise<Result<any[]>> {
  try {
    return await withCommOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const conditions = [eq(commTemplates.orgId, params.orgId)];
      if (params.eventKey) conditions.push(eq(commTemplates.key, params.eventKey));
      if (params.channel) conditions.push(eq(commTemplates.channel, params.channel));

      const rows = await db
        .select()
        .from(commTemplates)
        .where(and(...conditions))
        .orderBy(desc(commTemplates.updatedAt));

      return ok(rows);
    });
  } catch (error) {
    console.error('Error listing comm templates:', error);
    return err('INTERNAL_ERROR', 'Failed to list templates', error);
  }
}

export async function listCommPreferences(params: {
  orgId: string;
}): Promise<Result<any[]>> {
  try {
    return await withCommOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const rows = await db
        .select()
        .from(commPreferences)
        .where(eq(commPreferences.orgId, params.orgId))
        .orderBy(desc(commPreferences.updatedAt));
      return ok(rows);
    });
  } catch (error) {
    console.error('Error listing comm preferences:', error);
    return err('INTERNAL_ERROR', 'Failed to list preferences', error);
  }
}

export async function listCommOutbox(params: {
  orgId: string;
  status?: string;
  channel?: string;
  eventKey?: string;
  recipient?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<Result<any[]>> {
  try {
    return await withCommOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const conditions = [eq(commOutbox.orgId, params.orgId)];
      if (params.status) conditions.push(eq(commOutbox.status, params.status));
      if (params.channel) conditions.push(eq(commOutbox.channel, params.channel));
      if (params.eventKey) conditions.push(eq(commOutbox.eventKey, params.eventKey));
      if (params.recipient) conditions.push(ilike(commOutbox.recipientEmail, `%${params.recipient}%`));
      if (params.startDate) conditions.push(gte(commOutbox.createdAt, params.startDate));
      if (params.endDate) conditions.push(lte(commOutbox.createdAt, params.endDate));

      const limit = Math.max(1, Math.min(200, params.limit ?? 50));
      const rows = await db
        .select()
        .from(commOutbox)
        .where(and(...conditions))
        .orderBy(desc(commOutbox.createdAt))
        .limit(limit);

      return ok(rows);
    });
  } catch (error) {
    console.error('Error listing comm outbox:', error);
    return err('INTERNAL_ERROR', 'Failed to list outbox', error);
  }
}

export async function getCommProviderStatus(params: { orgId: string }): Promise<Result<any | null>> {
  try {
    return await withCommOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const [row] = await db
        .select()
        .from(commProviderStatus)
        .where(eq(commProviderStatus.orgId, params.orgId))
        .limit(1);
      return ok(row ?? null);
    });
  } catch (error) {
    console.error('Error getting comm provider status:', error);
    return err('INTERNAL_ERROR', 'Failed to load provider status', error);
  }
}
