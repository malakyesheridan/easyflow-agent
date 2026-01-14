export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '').trim();
  return digits.length > 0 ? digits : null;
}

export function buildFullName(params: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const full = params.fullName?.trim() ?? '';
  if (full) return full;
  const parts = [params.firstName?.trim(), params.lastName?.trim()].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return parts.join(' ');
}
