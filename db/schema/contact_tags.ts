import { pgTable, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { tags } from './tags';

export const contactTags = pgTable(
  'contact_tags',
  {
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    contactIdIdx: index('contact_tags_contact_id_idx').on(table.contactId),
    tagIdIdx: index('contact_tags_tag_id_idx').on(table.tagId),
    contactTagUnique: uniqueIndex('contact_tags_contact_id_tag_id_unique').on(
      table.contactId,
      table.tagId
    ),
  })
);

export type ContactTag = typeof contactTags.$inferSelect;
export type NewContactTag = typeof contactTags.$inferInsert;
