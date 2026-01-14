import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const buyerPipelineStages = pgTable(
  'buyer_pipeline_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('buyer_pipeline_stages_org_id_idx').on(table.orgId),
    orgNameUnique: uniqueIndex('buyer_pipeline_stages_org_name_unique').on(table.orgId, table.name),
  })
);

export type BuyerPipelineStage = typeof buyerPipelineStages.$inferSelect;
export type NewBuyerPipelineStage = typeof buyerPipelineStages.$inferInsert;
