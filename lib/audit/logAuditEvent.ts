import { auditLogs, type AuditLog } from '@/db/schema/audit_logs';
import { getDb } from '@/lib/db';

export type AuditActorType = AuditLog['actorType'];
export type AuditAction = AuditLog['action'];

export type AuditLogInput = {
  orgId: string;
  actorUserId?: string | null;
  actorType: AuditActorType;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown | null;
  after?: unknown | null;
  metadata?: Record<string, unknown> | null;
};

const REDACT_KEYS = new Set([
  'credentials',
  'password',
  'passwordHash',
  'secret',
  'apiKey',
  'token',
  'accessToken',
  'refreshToken',
]);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (!value || typeof value !== 'object') return value;

  const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
    if (REDACT_KEYS.has(key)) {
      return [key, '[REDACTED]'] as const;
    }
    return [key, sanitizeValue(val)] as const;
  });

  return Object.fromEntries(entries);
}

function sanitizePayload(input: unknown | null | undefined): unknown | null {
  if (input === undefined) return null;
  if (input === null) return null;
  return sanitizeValue(input);
}

export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    if (!input.orgId) return;
    const db = getDb();
    await db.insert(auditLogs).values({
      orgId: input.orgId,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: sanitizePayload(input.before),
      after: sanitizePayload(input.after),
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error('Audit log write failed:', error);
  }
}
