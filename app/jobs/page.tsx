import JobsTable from '@/components/jobs/JobsTable';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import Button from '@/components/ui/Button';
import Link from 'next/link';
import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
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

async function fetchAllJobs(orgId: string, baseUrl: string, cookieHeader: string) {
  try {
    // Fetch only active jobs (non-completed statuses)
    const statuses = ['scheduled', 'in_progress', 'unassigned'];
    
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
    console.error('Error fetching jobs:', error);
    return {
      ok: false as const,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch jobs',
        details: error,
      },
    };
  }
}

async function fetchAssignmentsForJobs(
  orgId: string,
  baseUrl: string,
  cookieHeader: string
): Promise<ScheduleAssignmentWithJob[]> {
  try {
    // Fetch all assignments for this org (broad date range to capture all)
    const today = new Date();
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - 1); // 1 month ago
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 3); // 3 months ahead
    
    const response = await fetch(
      `${baseUrl}/api/schedule-assignments?orgId=${orgId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      { cache: 'no-store', headers: cookieHeader ? { cookie: cookieHeader } : undefined }
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.ok ? (data.data as ScheduleAssignmentWithJob[]) : [];
  } catch (error) {
    console.error('Error fetching assignments:', error);
    return [];
  }
}

export default async function JobsPage({
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
  const [jobsResult, assignments] = await Promise.all([
    fetchAllJobs(resolvedOrgId, baseUrl, cookieHeader),
    fetchAssignmentsForJobs(resolvedOrgId, baseUrl, cookieHeader),
  ]);

  if (!jobsResult.ok) {
    return (
      <PageContainer>
        <PageHeader title="Jobs" />
        <Card>
          <p className="text-destructive font-medium">Error loading jobs</p>
          <p className="text-sm text-text-secondary mt-1">
            {jobsResult.error.message}
          </p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Jobs"
        actions={
          <Link href="/jobs/new">
            <Button>Create Job</Button>
          </Link>
        }
        mobileAction={
          <Link href="/jobs/new">
            <Button size="sm">+ Job</Button>
          </Link>
        }
      />
      <JobsTable jobs={jobsResult.data} assignments={assignments} />
    </PageContainer>
  );
}
