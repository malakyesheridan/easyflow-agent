import ScheduleView from '@/components/schedule/ScheduleView';
import ScheduleCrewView from '@/components/schedule/ScheduleCrewView';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import ScheduleMobileAction from '@/components/schedule/ScheduleMobileAction';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import type { Job } from '@/db/schema/jobs';
import type { CrewMember } from '@/db/schema/crew_members';
import { ZERO_UUID, getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { headers, cookies } from 'next/headers';
import { getSessionContext } from '@/lib/auth/session';
import { getSurface } from '@/lib/surface';

// Force dynamic rendering to ensure fresh data on every request
export const dynamic = 'force-dynamic';

/**
 * PHASE C2: Fetch schedule assignments instead of jobs.
 * 
 * Fetches assignments for a date range (covers month view navigation),
 * then fetches the associated jobs for display.
 */
async function fetchScheduleData(orgId: string, baseUrl: string, cookieHeader: string) {
  try {
    // Fetch assignments for a date range (previous month start → next month end)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    endDate.setHours(0, 0, 0, 0);

    const assignmentsResponse = await fetch(
      `${baseUrl}/api/schedule-assignments?orgId=${orgId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      { cache: 'no-store', headers: cookieHeader ? { cookie: cookieHeader } : undefined }
    );
    
    if (!assignmentsResponse.ok) {
      let details: unknown = 'API request failed';
      try {
        const text = await assignmentsResponse.text();
        try {
          const json = JSON.parse(text);
          details = json?.error ?? json ?? text;
        } catch {
          details = text || details;
        }
      } catch {
        // ignore
      }
      return {
        ok: false as const,
        error: {
          code: 'FETCH_ERROR',
          message: `Failed to fetch schedule assignments (HTTP ${assignmentsResponse.status})`,
          details,
        },
      };
    }
    
    const assignmentsData = await assignmentsResponse.json();
    
    if (!assignmentsData.ok) {
      return {
        ok: false as const,
        error: {
          code: assignmentsData.error?.code || 'FETCH_ERROR',
          message: assignmentsData.error || 'Failed to fetch schedule assignments',
          details: assignmentsData.error,
        },
      };
    }

    const assignments = assignmentsData.data as ScheduleAssignmentWithJob[];

    // Fetch all jobs for the org (for unassigned jobs panel and job selection)
    const jobsResponse = await fetch(`${baseUrl}/api/jobs?orgId=${orgId}&all=true`, {
      cache: 'no-store',
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    
    if (!jobsResponse.ok) {
      return {
        ok: false as const,
        error: {
          code: 'FETCH_ERROR',
          message: 'Failed to fetch jobs',
          details: 'API request failed',
        },
      };
    }
    
    const jobsData = await jobsResponse.json();
    
    if (!jobsData.ok) {
      return {
        ok: false as const,
        error: {
          code: jobsData.error?.code || 'FETCH_ERROR',
          message: jobsData.error?.message || 'Failed to fetch jobs',
          details: jobsData.error,
        },
      };
    }

    const allJobs = jobsData.data as Job[];

    // Fetch crew members (schedule lanes)
    let crewMembers: CrewMember[] = [];
    try {
      const crewsResponse = await fetch(`${baseUrl}/api/crews?orgId=${orgId}&activeOnly=true`, {
        cache: 'no-store',
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      });
      if (crewsResponse.ok) {
        const crewsData = await crewsResponse.json();
        if (crewsData.ok && Array.isArray(crewsData.data)) {
          crewMembers = crewsData.data as CrewMember[];
        }
      }
    } catch {
      // Leave crewMembers empty; ScheduleView will fall back to crewIds from assignments.
    }

    return {
      ok: true as const,
      data: {
        assignments,
        jobs: allJobs,
        crewMembers,
      },
    };
  } catch (error) {
    console.error('Error fetching schedule data:', error);
    return {
      ok: false as const,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch schedule data',
        details: error,
      },
    };
  }
}

async function fetchScheduleAssignments(orgId: string, baseUrl: string, cookieHeader: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    endDate.setHours(0, 0, 0, 0);

    const assignmentsResponse = await fetch(
      `${baseUrl}/api/schedule-assignments?orgId=${orgId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      { cache: 'no-store', headers: cookieHeader ? { cookie: cookieHeader } : undefined }
    );

    if (!assignmentsResponse.ok) {
      let details: unknown = 'API request failed';
      try {
        const text = await assignmentsResponse.text();
        try {
          const json = JSON.parse(text);
          details = json?.error ?? json ?? text;
        } catch {
          details = text || details;
        }
      } catch {
        // ignore
      }
      return {
        ok: false as const,
        error: {
          code: 'FETCH_ERROR',
          message: `Failed to fetch schedule assignments (HTTP ${assignmentsResponse.status})`,
          details,
        },
      };
    }

    const assignmentsData = await assignmentsResponse.json();

    if (!assignmentsData.ok) {
      return {
        ok: false as const,
        error: {
          code: assignmentsData.error?.code || 'FETCH_ERROR',
          message: assignmentsData.error || 'Failed to fetch schedule assignments',
          details: assignmentsData.error,
        },
      };
    }

    return {
      ok: true as const,
      data: {
        assignments: assignmentsData.data as ScheduleAssignmentWithJob[],
      },
    };
  } catch (error) {
    console.error('Error fetching schedule assignments:', error);
    return {
      ok: false as const,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch schedule assignments',
        details: error,
      },
    };
  }
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  const resolvedOrgId = orgId === ZERO_UUID ? '' : orgId;

  // Prefer request-derived base URL; fall back to env-based base URL if headers aren't available.
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

  const session = cookieHeader
    ? await getSessionContext(new Request('http://localhost', { headers: { cookie: cookieHeader } }))
    : null;
  const surface = getSurface(session?.actor ?? null, { userAgent: h.get('user-agent') });
  const isCrewSurface = surface === 'crew';

  const result = isCrewSurface
    ? await fetchScheduleAssignments(resolvedOrgId, baseUrl, cookieHeader)
    : await fetchScheduleData(resolvedOrgId, baseUrl, cookieHeader);
  const highlightCrewIdParam = searchParams?.highlightCrewId;
  const highlightCrewId =
    typeof highlightCrewIdParam === 'string' && highlightCrewIdParam.trim()
      ? highlightCrewIdParam
      : null;

  if (!result.ok) {
    return (
      <PageContainer>
        <PageHeader title="Schedule" mobileAction={<ScheduleMobileAction />} />
        <Card>
          <p className="text-destructive font-medium">Error loading schedule</p>
          <p className="text-sm text-text-secondary mt-1">
            {result.error.message}
          </p>
        </Card>
      </PageContainer>
    );
  }

  if (isCrewSurface) {
    const crewResult = result as {
      ok: true;
      data: { assignments: ScheduleAssignmentWithJob[] };
    };
    return (
      <PageContainer>
        <PageHeader title="Schedule" mobileAction={<ScheduleMobileAction />} />
        <ScheduleCrewView
          assignments={crewResult.data.assignments}
          orgId={resolvedOrgId}
        />
      </PageContainer>
    );
  }

  const adminResult = result as {
    ok: true;
    data: {
      assignments: ScheduleAssignmentWithJob[];
      jobs: Job[];
      crewMembers: CrewMember[];
    };
  };
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="px-4 py-8">
        <PageHeader title="Schedule" mobileAction={<ScheduleMobileAction />} />
        <ScheduleView
          assignments={adminResult.data.assignments}
          jobs={adminResult.data.jobs}
          orgId={resolvedOrgId}
          crewMembers={adminResult.data.crewMembers}
          initialHighlightCrewId={highlightCrewId}
        />
      </div>
    </div>
  );
}
