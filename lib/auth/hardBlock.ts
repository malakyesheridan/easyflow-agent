const DEFAULT_AUTH_HARD_BLOCK_MESSAGE =
  'Platform access is temporarily disabled. Please contact your administrator.';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isAuthHardBlocked(): boolean {
  const raw = process.env.AUTH_HARD_BLOCK?.trim().toLowerCase();
  // Default to unblocked; enable by setting AUTH_HARD_BLOCK=true.
  if (!raw) return false;
  return TRUE_VALUES.has(raw);
}

export function getAuthHardBlockMessage(): string {
  const message = process.env.AUTH_HARD_BLOCK_MESSAGE?.trim();
  return message || DEFAULT_AUTH_HARD_BLOCK_MESSAGE;
}
