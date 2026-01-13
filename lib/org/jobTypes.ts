import type { Job } from '@/db/schema/jobs';
import type { JobType } from '@/db/schema/job_types';
import type { OrgConfig } from '@/lib/org/orgConfig';

export function getJobTypeForJob(job: Job, config: OrgConfig | null | undefined): JobType | null {
  if (!config || !job.jobTypeId) return null;
  return config.jobTypes.find((type) => type.id === job.jobTypeId) ?? null;
}

export function getJobTypeLabel(job: Job, config: OrgConfig | null | undefined, fallback = 'Job'): string {
  return getJobTypeForJob(job, config)?.label ?? fallback;
}

export function getJobTypeColor(job: Job, config: OrgConfig | null | undefined): string | null {
  return getJobTypeForJob(job, config)?.color ?? null;
}
