export function toNumericString(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(value);
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function formatQuantity(value: unknown, unit: string | null | undefined): string {
  const n = toNumber(value);
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, '');
  return unit ? `${formatted} ${unit}` : formatted;
}

