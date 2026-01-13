export type AddressParts = {
  line1: string | null;
  line2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country?: string | null;
};

export function formatAddress(parts: AddressParts | null): string {
  if (!parts) return '';
  const pieces = [
    parts.line1,
    parts.line2,
    parts.suburb,
    parts.state,
    parts.postcode,
    parts.country,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  return pieces.join(', ');
}

export function formatCurrency(amountCents: number, currency: string): string {
  const normalized = Number.isFinite(amountCents) ? amountCents : 0;
  const code = currency?.trim() || 'AUD';
  const amount = normalized / 100;
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function formatInvoiceDate(date: Date | string | null): string {
  if (!date) return 'N/A';
  const resolved = typeof date === 'string' ? new Date(date) : date;
  if (!(resolved instanceof Date) || Number.isNaN(resolved.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(resolved);
}

export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return '0';
  const rounded = Math.round(quantity * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.00$/, '');
}

export function resolveBrandColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  return fallback;
}
