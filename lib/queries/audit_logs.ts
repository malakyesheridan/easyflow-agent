import { and, desc, eq, gte, ilike, lte, lt, or } from 'drizzle-orm';
import { auditLogs } from '@/db/schema/audit_logs';
import { users } from '@/db/schema/users';
import { getDb } from '@/lib/db';
import { ok, err, type Result } from '@/lib/result';

export type AuditLogListRow = {
  id: string;
  orgId: string;
  actorUserId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown | null;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
};

export type AuditLogDetail = AuditLogListRow & {
  before: unknown | null;
  after: unknown | null;
};

export async function listAuditLogs(params: {
  orgId: string;
  limit?: number;
  cursor?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  actorUserId?: string;
  actorQuery?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Result<{ rows: AuditLogListRow[]; nextCursor: string | null }>> {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(params.limit ?? 50, 200));

    const filters = [eq(auditLogs.orgId, params.orgId)];

    if (params.entityType) {
      filters.push(eq(auditLogs.entityType, params.entityType));
    }
    if (params.entityId) {
      filters.push(eq(auditLogs.entityId, params.entityId));
    }
    if (params.action) {
      filters.push(eq(auditLogs.action, params.action as any));
    }
    if (params.actorUserId) {
      filters.push(eq(auditLogs.actorUserId, params.actorUserId));
    }
    if (params.cursor) {
      const cursorDate = new Date(params.cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        filters.push(lt(auditLogs.createdAt, cursorDate));
      }
    }
    if (params.startDate) {
      const startDate = new Date(params.startDate);
      if (!Number.isNaN(startDate.getTime())) {
        filters.push(gte(auditLogs.createdAt, startDate));
      }
    }
    if (params.endDate) {
      const endValue = params.endDate.length <= 10
        ? `${params.endDate}T23:59:59.999Z`
        : params.endDate;
      const endDate = new Date(endValue);
      if (!Number.isNaN(endDate.getTime())) {
        filters.push(lte(auditLogs.createdAt, endDate));
      }
    }

    const actorFilter = params.actorQuery?.trim();
    const rows = await db
      .select({
        id: auditLogs.id,
        orgId: auditLogs.orgId,
        actorUserId: auditLogs.actorUserId,
        actorType: auditLogs.actorType,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(
        and(
          ...filters,
          actorFilter
            ? or(
              ilike(users.email, `%${actorFilter}%`),
              ilike(users.name, `%${actorFilter}%`)
            )
            : undefined
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit + 1);

    let nextCursor: string | null = null;
    let resultRows = rows;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      resultRows = rows.slice(0, limit);
      nextCursor = last?.createdAt ? new Date(last.createdAt).toISOString() : null;
    }

    return ok({ rows: resultRows, nextCursor });
  } catch (error) {
    console.error('Error listing audit logs:', error);
    return err('INTERNAL_ERROR', 'Failed to list audit logs', error);
  }
}

export async function getAuditLogById(params: {
  orgId: string;
  id: string;
}): Promise<Result<AuditLogDetail>> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        id: auditLogs.id,
        orgId: auditLogs.orgId,
        actorUserId: auditLogs.actorUserId,
        actorType: auditLogs.actorType,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        before: auditLogs.before,
        after: auditLogs.after,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(and(eq(auditLogs.orgId, params.orgId), eq(auditLogs.id, params.id)))
      .limit(1);

    if (!row) return err('NOT_FOUND', 'Audit log not found');
    return ok(row);
  } catch (error) {
    console.error('Error getting audit log:', error);
    return err('INTERNAL_ERROR', 'Failed to get audit log', error);
  }
}
