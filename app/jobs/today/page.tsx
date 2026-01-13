import TodayJobsView from '@/components/jobs/TodayJobsView';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { ZERO_UUID, getOrgIdFromSearchParams } from '@/lib/org/orgId';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { headers, cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getBaseUrlFromRequest() {
  const h = headers();
  const proto = h.get('x-forwarded-proto') || 'http';
  const host = h.get('x-forwarded-host') || h.get('host') || '';

  const webPort = process.env.WEB_PORT || process.env.PORT || '3000';
  const envBaseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${webPort}`);

  return host ? `${proto}://${host}` : envBaseUrl;
}

async function fetchTodayAssignments(orgId: string, baseUrl: string, cookieHeader: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const response = await fetch(
      `${baseUrl}/api/schedule-assignments?orgId=${orgId}&date=${today.toISOString()}`,
      { cache: 'no-store', headers: cookieHeader ? { cookie: cookieHeader } : undefined }
    );

    if (!response.ok) {
      return {
        ok: false as const,
        error: {
          code: 'FETCH_ERROR',
          message: `Failed to fetch today assignments (HTTP ${response.status})`,
        },
      };
    }

    const data = await response.json();
    if (!data.ok) {
      return {
        ok: false as const,
        error: {
          code: data.error?.code || 'FETCH_ERROR',
          message: data.error?.message || 'Failed to fetch today assignments',
        },
      };
    }

    return {
      ok: true as const,
      data: data.data as ScheduleAssignmentWithJob[],
    };
  } catch (error) {
    console.error('Error fetching today assignments:', error);
    return {
      ok: false as const,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch today assignments',
      },
    };
  }
}

export default async function TodayJobsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  const resolvedOrgId = orgId === ZERO_UUID ? '' : orgId;
  const baseUrl = getBaseUrlFromRequest();
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const result = await fetchTodayAssignments(resolvedOrgId, baseUrl, cookieHeader);

  if (!result.ok) {
    return (
      <PageContainer>
        <PageHeader title="Today" subtitle="Today's jobs" />
        <Card>
          <p className="text-destructive font-medium">Error loading today</p>
          <p className="text-sm text-text-secondary mt-1">{result.error.message}</p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Today" subtitle="Today's jobs" />
      <TodayJobsView assignments={result.data} orgId={resolvedOrgId} />
    </PageContainer>
  );
}
