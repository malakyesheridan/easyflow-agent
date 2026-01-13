import { pgTable, uuid, text, timestamp, numeric, index, boolean, integer } from 'drizzle-orm/pg-core';

export const materials = pgTable(
  'stock_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    category: text('category'),
    unit: text('unit').notNull(),
    unitCostCents: integer('unit_cost_cents'),
    imageUrl: text('image_url'),
    description: text('description'),
    reorderThreshold: numeric('reorder_threshold', { precision: 14, scale: 4 }),
    reorderQuantity: numeric('reorder_quantity', { precision: 14, scale: 4 }),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdNameIdx: index('materials_org_id_name_idx').on(table.orgId, table.name),
    orgIdCategoryIdx: index('materials_org_id_category_idx').on(table.orgId, table.category),
  })
);

export type Material = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;

// Backwards-compatible export name (legacy placeholder table).
export const stockItems = materials;
