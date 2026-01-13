import { pgTable, uuid, text, jsonb, boolean, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const integrationStatusEnum = pgEnum('integration_status', [
  'disconnected',
  'connected',
  'error',
  'disabled',
]);

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    displayName: text('display_name').notNull(),
    credentials: jsonb('credentials'),
    rules: jsonb('rules'),
    enabled: boolean('enabled').notNull().default(false),
    status: integrationStatusEnum('status').notNull().default('disconnected'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('integrations_org_id_idx').on(table.orgId),
    orgProviderUnique: uniqueIndex('integrations_org_provider_unique').on(table.orgId, table.provider),
  })
);

export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
