import { cookies, headers } from 'next/headers';
import OperationsHub from '@/components/operations/OperationsHub';
import { ZERO_UUID, getOrgIdFromSearchParams } from '@/lib/org/orgId';
import type { OperationsMapPayload } from '@/lib/types/operations_map';
import { getSessionContext } from '@/lib/auth/session';
import { getSurface } from '@/lib/surface';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { message?: string } | string };

export const dynamic = 'force-dynamic';

async function fetchOperationsMapData(orgId: string, baseUrl: string, cookieHeader: string) {
  try {
    const res = await fetch(`${baseUrl}/api/operations/map?orgId=${orgId}`, {
      cache: 'no-store',
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!res.ok) {
      return {
        ok: false as const,
        error: `Failed to load operations map (HTTP ${res.status})`,
      };
    }
    const json = (await res.json()) as ApiResponse<OperationsMapPayload>;
    if (!json.ok) {
      const message = typeof json.error === 'string' ? json.error : json.error?.message;
      return { ok: false as const, error: message || 'Failed to load operations map' };
    }
    return { ok: true as const, data: json.data };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Failed to load operations map',
    };
  }
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  const resolvedOrgId = orgId === ZERO_UUID ? '' : orgId;

  const h = headers();
  const proto = h.get('x-forwarded-proto') || 'http';
  const host = h.get('x-forwarded-host') || h.get('host') || '';

  const webPort = process.env.WEB_PORT || process.env.PORT || '3000';
  const envBaseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${webPort}`);

  const baseUrl = host ? `${proto}://${host}` : envBaseUrl;
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const result = await fetchOperationsMapData(resolvedOrgId, baseUrl, cookieHeader);
  const session = cookieHeader
    ? await getSessionContext(new Request('http://localhost', { headers: { cookie: cookieHeader } }))
    : null;
  const surface = getSurface(session?.actor ?? null, { userAgent: h.get('user-agent') });

  return (
    <OperationsHub
      mapPayload={result.ok ? result.data : null}
      mapError={result.ok ? null : result.error}
      orgId={resolvedOrgId}
      surface={surface}
    />
  );
}
