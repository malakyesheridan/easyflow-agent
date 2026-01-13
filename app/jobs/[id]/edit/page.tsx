import JobEditForm from '@/components/jobs/JobEditForm';
import { getJobById } from '@/lib/queries/jobs';
import { listScheduleAssignmentsByJobId } from '@/lib/queries/schedule_assignments';
import { dbAssignmentToFrontend } from '@/lib/types/schedule';
import { getJobsByIds } from '@/lib/queries/jobs';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { getSessionContext } from '@/lib/auth/session';
import type { RequestActor } from '@/lib/authz';
import { headers } from 'next/headers';

interface JobEditPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
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

async function resolveSession(searchParams: Record<string, string | string[] | undefined> | undefined): Promise<{
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

export default async function JobEditPage({ params, searchParams }: JobEditPageProps) {
  const { id } = await params;
  const session = await resolveSession(searchParams);
  if (!session.orgId || !session.actor) {
    return (
      <PageContainer>
        <PageHeader title="Error" />
        <Card>
          <p className="text-destructive font-medium">
            Error loading job
          </p>
        </Card>
      </PageContainer>
    );
  }
  const result = await getJobById(id, session.orgId, session.actor);

  if (!result.ok) {
    return (
      <PageContainer>
        <PageHeader title="Error" />
        <Card>
          <p className="text-destructive font-medium">
            {result.error.code === 'NOT_FOUND' ? 'Job not found' : 'Error loading job'}
          </p>
        </Card>
      </PageContainer>
    );
  }

  // PHASE C3: Fetch assignments to show warning
  const assignments = await fetchJobAssignments(id, session.orgId, session.actor);

  return (
    <PageContainer>
      <PageHeader title={`Edit Job: ${result.data.title}`} />
      <JobEditForm job={result.data} orgId={session.orgId} assignments={assignments} />
    </PageContainer>
  );
}
