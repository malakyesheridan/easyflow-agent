import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

type DbClient = ReturnType<typeof getDb>;

export async function withCommOrgScope<T>(
  params: { orgId: string; userId?: string | null; roleKey?: string | null },
  fn: (db: DbClient) => Promise<T>
): Promise<T> {
  const db = getDb();
  const roleKey = params.roleKey ?? 'system';
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${params.orgId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${params.userId ?? ''}, true)`);
    await tx.execute(sql`select set_config('app.role', ${roleKey}, true)`);
    return await fn(tx as DbClient);
  });
}
