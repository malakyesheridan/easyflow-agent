const DEFAULT_AUTH_HARD_BLOCK_MESSAGE =
  'Platform access is temporarily disabled. Please contact your administrator.';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export function isAuthHardBlocked(): boolean {
  const raw = process.env.AUTH_HARD_BLOCK?.trim().toLowerCase();
  // Default to blocked unless explicitly disabled.
  if (!raw) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return TRUE_VALUES.has(raw);
}

export function getAuthHardBlockMessage(): string {
  const message = process.env.AUTH_HARD_BLOCK_MESSAGE?.trim();
  return message || DEFAULT_AUTH_HARD_BLOCK_MESSAGE;
}
