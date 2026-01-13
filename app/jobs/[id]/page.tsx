import JobDetailAdmin from '@/components/jobs/JobDetailAdmin';
import JobDetailCrew from '@/components/jobs/JobDetailCrew';
import { listScheduleAssignmentsByJobId } from '@/lib/queries/schedule_assignments';
import { dbAssignmentToFrontend } from '@/lib/types/schedule';
import { getJobsByIds } from '@/lib/queries/jobs';
import { PageContainer, Card } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { getSessionContext } from '@/lib/auth/session';
import { canLogMaterialUsage, type RequestActor } from '@/lib/authz';
import { headers } from 'next/headers';
import { getSurface } from '@/lib/surface';
import { getJobDetailForAdmin, getJobDetailForCrew } from '@/lib/queries/job_detail';

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * PHASE C3: Fetch schedule assignments for this job using direct query.
 */
async function fetchJobAssignments(jobId: string, orgId: string, actor: RequestActor) {
  try {
    if (!orgId) return [];
    const assignmentsResult = await listScheduleAssignmentsByJobId(jobId, orgId, actor);
    
    if (!assignmentsResult.ok || assignmentsResult.data.length === 0) {
      return [];
    }
    
    // Join job data
    const jobIds = [...new Set(assignmentsResult.data.map(a => a.jobId))];
    const jobsResult = await getJobsByIds(jobIds, orgId, actor);
    
    if (!jobsResult.ok) {
      console.error('Error fetching jobs for assignments:', jobsResult.error);
      return [];
    }
    
    const jobsMap = new Map(jobsResult.data.map(job => [job.id, job]));
    
    return assignmentsResult.data.map(dbAssignment => {
      const job = jobsMap.get(dbAssignment.jobId);
      if (!job) {
        console.warn(`Job not found for assignment ${dbAssignment.id}, jobId ${dbAssignment.jobId}`);
        return null;
      }
      return dbAssignmentToFrontend(dbAssignment, job);
    }).filter((a): a is NonNullable<typeof a> => a !== null);
  } catch (error) {
    console.error('Error fetching job assignments:', error);
    return [];
  }
}

async function resolveSession(searchParams: Record<string, string | string[] | undefined>): Promise<{
  orgId: string;
  actor: RequestActor | null;
}> {
  const fromQuery = getOrgIdFromSearchParams(searchParams);
  const cookie = headers().get('cookie') ?? '';
  if (!cookie) return { orgId: '', actor: null };
  const session = await getSessionContext(new Request('http://localhost', { headers: { cookie } }));
  if (!session) return { orgId: '', actor: null };
  const orgId = fromQuery && fromQuery === session.org.id ? fromQuery : session.org.id;
  return { orgId, actor: session.actor };
}

export default async function JobDetailPage({ params, searchParams }: JobDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const fromUnassigned = resolvedSearchParams.from === 'unassigned';
  const session = await resolveSession(resolvedSearchParams);
  if (!session.orgId || !session.actor) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">
            The job you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
          </p>
        </Card>
      </PageContainer>
    );
  }
  // PHASE C3: Fetch assignments for this job
  const assignments = await fetchJobAssignments(id, session.orgId, session.actor);

  const userAgent = headers().get('user-agent');
  const surface = getSurface(session.actor, { userAgent });

  if (surface === 'crew') {
    const crewResult = await getJobDetailForCrew(id, session.orgId, session.actor);
    if (!crewResult.ok) {
      return (
        <PageContainer>
          <Card>
            <p className="text-text-secondary">
              The job you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
            </p>
          </Card>
        </PageContainer>
      );
    }

    return (
      <PageContainer>
        <JobDetailCrew
          job={crewResult.data.job}
          client={crewResult.data.client}
          links={crewResult.data.links}
          orgId={session.orgId}
          showUnassignedBanner={fromUnassigned}
          assignments={assignments}
          canLogMaterials={canLogMaterialUsage(session.actor)}
        />
      </PageContainer>
    );
  }

  const adminResult = await getJobDetailForAdmin(id, session.orgId, session.actor);
  if (!adminResult.ok) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">
            The job you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
          </p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <JobDetailAdmin
        job={adminResult.data.job}
        client={adminResult.data.client}
        orgId={session.orgId}
        showUnassignedBanner={fromUnassigned}
        assignments={assignments}
      />
    </PageContainer>
  );
}
