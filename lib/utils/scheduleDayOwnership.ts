import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';

const ORG_TIMEZONE =
  process.env.NEXT_PUBLIC_ORG_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  'UTC';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ORG_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getOrgDayKey(dateLike: Date | string): string {
  const date = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
  const parts = dayFormatter.formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

export function toOrgStartOfDay(dateLike: Date | string): Date {
  const dayKey = getOrgDayKey(dateLike);
  return dayKey ? new Date(`${dayKey}T00:00:00.000Z`) : new Date(dateLike);
}

export function isSameOrgDay(a: Date | string, b: Date | string): boolean {
  return getOrgDayKey(a) === getOrgDayKey(b);
}

export function normalizeAssignmentForOrgDay(
  assignment: ScheduleAssignmentWithJob
): ScheduleAssignmentWithJob {
  const normalizedDate = toOrgStartOfDay(assignment.date);
  const scheduledStart =
    assignment.scheduledStart instanceof Date
      ? assignment.scheduledStart
      : new Date(assignment.scheduledStart);
  const scheduledEnd =
    assignment.scheduledEnd instanceof Date
      ? assignment.scheduledEnd
      : new Date(assignment.scheduledEnd);

  return {
    ...assignment,
    date: normalizedDate,
    scheduledStart,
    scheduledEnd,
  };
}

export { ORG_TIMEZONE };
