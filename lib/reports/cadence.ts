export type CadenceType = 'weekly' | 'fortnightly' | 'monthly' | 'custom' | 'none';

export type CadenceConfig = {
  cadenceType: CadenceType;
  intervalDays?: number | null;
  dayOfWeek?: number | null;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextDayOfWeek(from: Date, dayOfWeek: number) {
  const next = new Date(from);
  const delta = (dayOfWeek + 7 - next.getDay()) % 7 || 7;
  next.setDate(next.getDate() + delta);
  return next;
}

export function computeNextDueAt(params: {
  baseDate: Date;
  cadence: CadenceConfig;
}): Date | null {
  const { baseDate, cadence } = params;
  if (cadence.cadenceType === 'none') return null;

  if (cadence.cadenceType === 'custom' && cadence.intervalDays) {
    return addDays(baseDate, cadence.intervalDays);
  }

  if (cadence.cadenceType === 'weekly') {
    if (cadence.dayOfWeek !== null && cadence.dayOfWeek !== undefined) {
      return nextDayOfWeek(baseDate, cadence.dayOfWeek);
    }
    return addDays(baseDate, 7);
  }

  if (cadence.cadenceType === 'fortnightly') {
    if (cadence.dayOfWeek !== null && cadence.dayOfWeek !== undefined) {
      return addDays(nextDayOfWeek(baseDate, cadence.dayOfWeek), 7);
    }
    return addDays(baseDate, 14);
  }

  if (cadence.cadenceType === 'monthly') {
    if (cadence.dayOfWeek !== null && cadence.dayOfWeek !== undefined) {
      return nextDayOfWeek(addDays(baseDate, 21), cadence.dayOfWeek);
    }
    return addDays(baseDate, 30);
  }

  return addDays(baseDate, 7);
}

export function getCadenceLabel(cadence: CadenceConfig): string {
  if (cadence.cadenceType === 'custom' && cadence.intervalDays) {
    return `Every ${cadence.intervalDays} days`;
  }
  if (cadence.cadenceType === 'fortnightly') return 'Fortnightly';
  if (cadence.cadenceType === 'monthly') return 'Monthly';
  if (cadence.cadenceType === 'weekly') return 'Weekly';
  return 'None';
}
