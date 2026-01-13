import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orgClients, type OrgClient } from '@/db/schema/org_clients';
import { ok, err, type Result } from '@/lib/result';

export type ClientSummary = Pick<OrgClient, 'id' | 'displayName' | 'email' | 'phone'>;

export async function listClients(params: {
  orgId: string;
  query?: string | null;
  limit?: number;
}): Promise<Result<ClientSummary[]>> {
  try {
    const db = getDb();
    const search = params.query?.trim();
    const limit = params.limit && params.limit > 0 ? params.limit : 20;

    const baseWhere = eq(orgClients.orgId, params.orgId);
    const where = search
      ? and(
          baseWhere,
          or(
            ilike(orgClients.displayName, `%${search}%`),
            ilike(orgClients.email, `%${search}%`),
            ilike(orgClients.phone, `%${search}%`)
          )
        )
      : baseWhere;

    const rows = await db
      .select({
        id: orgClients.id,
        displayName: orgClients.displayName,
        email: orgClients.email,
        phone: orgClients.phone,
      })
      .from(orgClients)
      .where(where)
      .orderBy(asc(orgClients.displayName))
      .limit(limit);

    return ok(rows);
  } catch (error) {
    console.error('Error listing clients:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch clients', error);
  }
}

export async function getClientById(params: {
  orgId: string;
  clientId: string;
}): Promise<Result<OrgClient>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(orgClients)
      .where(and(eq(orgClients.id, params.clientId), eq(orgClients.orgId, params.orgId)))
      .limit(1);

    if (!row) {
      return err('NOT_FOUND', 'Client not found');
    }

    return ok(row);
  } catch (error) {
    console.error('Error fetching client:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch client', error);
  }
}

export async function listClientsByIds(params: {
  orgId: string;
  clientIds: string[];
}): Promise<Result<Array<Pick<OrgClient, 'id' | 'displayName'>>>> {
  try {
    if (params.clientIds.length === 0) return ok([]);
    const db = getDb();
    const rows = await db
      .select({ id: orgClients.id, displayName: orgClients.displayName })
      .from(orgClients)
      .where(and(eq(orgClients.orgId, params.orgId), inArray(orgClients.id, params.clientIds)));
    return ok(rows);
  } catch (error) {
    console.error('Error listing clients by ids:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch clients', error);
  }
}
