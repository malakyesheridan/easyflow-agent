import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { automationRuleRuns } from '@/db/schema/automation_rule_runs';
import { getDb } from '@/lib/db';

export const RULE_LIMITS = {
  perHour: 20,
  perDay: 200,
};

export async function checkRuleRateLimit(params: {
  db: ReturnType<typeof getDb>;
  orgId: string;
  ruleId: string;
  now?: Date;
}): Promise<{ limited: boolean; hourlyCount: number; dailyCount: number }> {
  const now = params.now ?? new Date();
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000);
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [hourRow] = await params.db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(automationRuleRuns)
    .where(
      and(
        eq(automationRuleRuns.orgId, params.orgId),
        eq(automationRuleRuns.ruleId, params.ruleId),
        gte(automationRuleRuns.createdAt, hourStart),
        ne(automationRuleRuns.status, 'skipped')
      )
    );

  const [dayRow] = await params.db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(automationRuleRuns)
    .where(
      and(
        eq(automationRuleRuns.orgId, params.orgId),
        eq(automationRuleRuns.ruleId, params.ruleId),
        gte(automationRuleRuns.createdAt, dayStart),
        ne(automationRuleRuns.status, 'skipped')
      )
    );

  const hourlyCount = Number(hourRow?.count ?? 0);
  const dailyCount = Number(dayRow?.count ?? 0);

  return {
    limited: hourlyCount > RULE_LIMITS.perHour || dailyCount > RULE_LIMITS.perDay,
    hourlyCount,
    dailyCount,
  };
}
