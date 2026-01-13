import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const auditActionEnum = pgEnum('audit_action', [
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'ASSIGN',
  'UNASSIGN',
  'RESCHEDULE',
  'STOCK_CHANGE',
  'NOTE',
  'PHOTO_UPLOAD',
  'PHOTO_DELETE',
  'NOTIFICATION_SENT',
  'SETTINGS_CHANGE',
  'INTEGRATION_CHANGE',
  'LOGIN',
  'LOGOUT',
  'VIEW',
]);

export const auditActorTypeEnum = pgEnum('audit_actor_type', [
  'user',
  'system',
  'integration',
]);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: auditActorTypeEnum('actor_type').notNull(),
    action: auditActionEnum('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdCreatedAtIdx: index('audit_logs_org_id_created_at_idx').on(table.orgId, table.createdAt),
    orgIdEntityIdx: index('audit_logs_org_id_entity_idx').on(table.orgId, table.entityType, table.entityId),
    orgIdActorIdx: index('audit_logs_org_id_actor_idx').on(table.orgId, table.actorUserId),
    orgIdActionIdx: index('audit_logs_org_id_action_idx').on(table.orgId, table.action),
  })
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
