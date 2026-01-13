import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

type DbClient = ReturnType<typeof getDb>;

export async function withIntegrationOrgScope<T>(
  orgId: string,
  fn: (db: DbClient) => Promise<T>
): Promise<T> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return await fn(tx as DbClient);
  });
}
