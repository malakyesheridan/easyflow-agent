import { createHash } from 'crypto';
import type { TriggerKey } from './types';
import { TRIGGER_KEYS } from './types';

const EVENT_KEY_TO_TRIGGER_KEY: Record<string, TriggerKey> = {
  'job.created': 'job.created',
  'job.assigned': 'job.assigned',
  'job.rescheduled': 'job.rescheduled',
  'job.status.updated': 'job.status_updated',
  'job.progress.updated': 'job.progress_updated',
  'job.completed': 'job.completed',
  'job.photos.added': 'job.photo_added',
  'job.notes.updated': 'job.notes_updated',
  'invoice.sent': 'invoice.sent',
  'invoice.issued': 'invoice.issued',
  'invoice.paid': 'invoice.paid',
  'invoice.overdue': 'invoice.overdue',
  'payment.received': 'payment.received',
  'payment.recorded': 'payment.recorded',
  'material.stock.low': 'material.stock_low',
  'material.stock.updated': 'material.stock_updated',
  'time.daily': 'time.daily',
};

const DIRECT_TRIGGER_KEYS = new Set<string>(TRIGGER_KEYS);

const TRIGGER_KEY_TO_EVENT_KEY: Record<TriggerKey, string> = {
  'job.created': 'job.created',
  'job.assigned': 'job.assigned',
  'job.rescheduled': 'job.rescheduled',
  'job.status_updated': 'job.status.updated',
  'job.progress_updated': 'job.progress.updated',
  'job.completed': 'job.completed',
  'job.photo_added': 'job.photos.added',
  'job.notes_updated': 'job.notes.updated',
  'invoice.sent': 'invoice.sent',
  'invoice.issued': 'invoice.issued',
  'invoice.paid': 'invoice.paid',
  'invoice.overdue': 'invoice.overdue',
  'payment.received': 'payment.received',
  'payment.recorded': 'payment.recorded',
  'material.stock_low': 'material.stock.low',
  'material.stock_updated': 'material.stock.updated',
  'time.daily': 'time.daily',
};

export function resolveTriggerKey(eventKey: string): TriggerKey | null {
  if (DIRECT_TRIGGER_KEYS.has(eventKey)) return eventKey as TriggerKey;
  return EVENT_KEY_TO_TRIGGER_KEY[eventKey] ?? null;
}

export function resolveEventTypeForTrigger(triggerKey: TriggerKey): string {
  return TRIGGER_KEY_TO_EVENT_KEY[triggerKey] ?? triggerKey;
}

function progressBucket(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress / 5) * 5));
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

export function buildEventEntityId(params: {
  triggerKey: TriggerKey;
  payload: Record<string, unknown>;
  eventCreatedAt?: Date | string | null;
}): string {
  const payload = params.payload;
  const providedEntityId = typeof payload.entityId === 'string' ? payload.entityId : null;
  if (providedEntityId) return providedEntityId;

  const jobId = typeof payload.jobId === 'string' ? payload.jobId : '';
  const materialId = typeof payload.materialId === 'string' ? payload.materialId : '';
  const assignmentId = typeof payload.assignmentId === 'string' ? payload.assignmentId : '';
  const status = typeof payload.status === 'string' ? payload.status : '';
  const progressPercent = typeof (payload as any).progressPercent === 'number' ? (payload as any).progressPercent : null;
  const createdAt = toIso(params.eventCreatedAt) || new Date().toISOString();

  switch (params.triggerKey) {
    case 'job.status_updated': {
      return `${jobId}:${status}:${createdAt}`;
    }
    case 'job.progress_updated': {
      const bucket = progressPercent !== null ? progressBucket(progressPercent) : 0;
      return `${jobId}:${bucket}:${createdAt}`;
    }
    case 'job.assigned':
    case 'job.rescheduled': {
      return `${assignmentId || jobId}:${createdAt}`;
    }
    case 'material.stock_low':
    case 'material.stock_updated': {
      return `${materialId}:${createdAt}`;
    }
    case 'payment.received':
    case 'payment.recorded':
    case 'invoice.sent':
    case 'invoice.issued':
    case 'invoice.paid':
    case 'invoice.overdue': {
      return `${jobId}:${createdAt}`;
    }
    case 'time.daily': {
      const dayKey = createdAt.slice(0, 10);
      return `${params.triggerKey}:${dayKey}`;
    }
    default: {
      return `${jobId || materialId || assignmentId || params.triggerKey}:${createdAt}`;
    }
  }
}

export function buildIdempotencyKey(params: { orgId: string; ruleId: string; eventEntityId: string }): string {
  const raw = `${params.orgId}:${params.ruleId}:${params.eventEntityId}`;
  return createHash('sha256').update(raw).digest('hex');
}
