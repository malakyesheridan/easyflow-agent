import UnassignedJobsList from '@/components/jobs/UnassignedJobsList';
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

async function fetchUnassignedJobs(orgId: string, baseUrl: string, cookieHeader: string) {
  try {
    // Fetch unassigned jobs
    const statuses = ['unassigned'];
    
    const allJobsPromises = statuses.map(async (status) => {
      const response = await fetch(`${baseUrl}/api/jobs?orgId=${orgId}&status=${status}`, {
        cache: 'no-store',
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      });
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      return data.ok ? (data.data as Job[]) : [];
    });

    const allJobsArrays = await Promise.all(allJobsPromises);
    const allJobs = allJobsArrays.flat();

    return {
      ok: true as const,
      data: allJobs,
    };
  } catch (error) {
    console.error('Error fetching unassigned jobs:', error);
    return {
      ok: false as const,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch unassigned jobs',
        details: error,
      },
    };
  }
}

export default async function UnassignedJobsPage({
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
  const result = await fetchUnassignedJobs(resolvedOrgId, baseUrl, cookieHeader);

  if (!result.ok) {
    return (
      <PageContainer>
        <PageHeader 
          title="Unassigned Jobs"
          subtitle="Jobs ready to be picked up and scheduled"
        />
        <Card>
          <p className="text-destructive font-medium">Error loading unassigned jobs</p>
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
        title="Unassigned Jobs"
        subtitle="Jobs ready to be picked up and scheduled"
      />
      <UnassignedJobsList jobs={result.data} orgId={resolvedOrgId} />
    </PageContainer>
  );
}
