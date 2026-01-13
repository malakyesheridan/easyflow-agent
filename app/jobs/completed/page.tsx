import CompletedJobsList from '@/components/jobs/CompletedJobsList';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import type { Job } from '@/db/schema/jobs';
import { ZERO_UUID, getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { headers, cookies } from 'next/headers';

// Force dynamic rendering to ensure fresh data on every request
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

async function fetchCompletedJobs(orgId: string, baseUrl: string, cookieHeader: string) {
  try {
    // Fetch only completed jobs
    const response = await fetch(`${baseUrl}/api/jobs?orgId=${orgId}&status=completed`, {
      cache: 'no-store',
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    
    if (!response.ok) {
      return {
        ok: false as const,
        error: {
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      return {
        ok: false as const,
        error: data.error,
      };
    }

    return {
      ok: true as const,
      data: data.data as Job[],
    };
  } catch (error) {
    console.error('Error fetching completed jobs:', error);
    return {
      ok: false as const,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch completed jobs',
        details: error,
      },
    };
  }
}

export default async function CompletedJobsPage({
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
  const result = await fetchCompletedJobs(resolvedOrgId, baseUrl, cookieHeader);

  if (!result.ok) {
    return (
      <PageContainer>
        <PageHeader 
          title="Completed Jobs"
          subtitle="Archive of completed work"
        />
        <Card>
          <p className="text-destructive font-medium">Error loading completed jobs</p>
          <p className="text-sm text-text-secondary mt-1">
            {result.error.message}
          </p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader 
        title="Completed Jobs"
        subtitle="Archive of completed work"
      />
      <CompletedJobsList jobs={result.data} orgId={resolvedOrgId} />
    </PageContainer>
  );
}
