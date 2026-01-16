import type { NotificationType } from '@/lib/notifications/constants';

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildNotificationKey(params: {
  type: NotificationType;
  entityId?: string | null;
  date?: Date;
  suffix?: string | null;
}) {
  const dateKey = toDateKey(params.date ?? new Date());
  const entity = params.entityId ?? 'org';
  const suffix = params.suffix ? `:${params.suffix}` : '';
  return `notif:${params.type}:${entity}:${dateKey}${suffix}`;
}
