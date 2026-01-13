import { pgTable, uuid, text, jsonb, boolean, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const commTemplates = pgTable(
  'comm_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    key: text('key').notNull(),
    channel: text('channel').notNull(),
    name: text('name').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    bodyHtml: text('body_html'),
    variablesSchema: jsonb('variables_schema').notNull().default({}),
    isEnabled: boolean('is_enabled').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orgKeyChannelVersionUnique: uniqueIndex('comm_templates_org_key_channel_version_unique').on(
      table.orgId,
      table.key,
      table.channel,
      table.version
    ),
    orgKeyChannelIdx: index('comm_templates_org_key_channel_idx').on(table.orgId, table.key, table.channel),
  })
);

export type CommTemplate = typeof commTemplates.$inferSelect;
export type NewCommTemplate = typeof commTemplates.$inferInsert;
