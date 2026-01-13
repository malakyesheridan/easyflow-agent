export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
let didWarnMissingOrgEnv = false;

/**
 * Default org resolution for server-rendered pages.
 *
 * - If an env default is set, use it.
 * - Otherwise return empty and let API routes resolve org from session.
 */
export function getDefaultOrgId(): string {
  const env =
    process.env.NEXT_PUBLIC_DEFAULT_ORG_ID?.trim() ||
    process.env.DEFAULT_ORG_ID?.trim();

  if (env && env !== ZERO_UUID) return env;

  if (!didWarnMissingOrgEnv) {
    didWarnMissingOrgEnv = true;
    console.warn(
      'DEFAULT_ORG_ID/NEXT_PUBLIC_DEFAULT_ORG_ID is missing; relying on session orgId.'
    );
  }
  return '';
}

export function getOrgIdFromSearchParams(
  searchParams: Record<string, string | string[] | undefined> | undefined
): string {
  const fromQuery = searchParams?.orgId;
  if (typeof fromQuery === 'string') {
    const trimmed = fromQuery.trim();
    if (trimmed && trimmed !== ZERO_UUID) return trimmed;
  }
  return getDefaultOrgId();
}
