import type { JobProgressStatus, JobStatus } from '@/lib/validators/jobs';

export type CrewState = 'on_job' | 'en_route' | 'idle' | 'off_shift';

export type CrewLocationSource = 'live' | 'last_job' | 'last_checkin' | 'none';

export type OperationsMapJob = {
  id: string;
  title: string;
  status: JobStatus;
  scheduleState: 'scheduled_unassigned' | 'scheduled_assigned' | null;
  progressStatus: JobProgressStatus;
  progressPercent: number | null;
  crew: Array<{ id: string; name: string }>;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  address: string;
  shortAddress: string;
  latitude: number | null;
  longitude: number | null;
  risk: {
    late: boolean;
    blocked: boolean;
    idleRisk: boolean;
    atRisk: boolean;
    reasons: string[];
  };
};

export type OperationsMapCrew = {
  id: string;
  name: string;
  role: string | null;
  active: boolean;
  state: CrewState;
  idleMinutes: number | null;
  idleRisk: boolean;
  location: {
    lat: number | null;
    lng: number | null;
    address: string | null;
    source: CrewLocationSource;
    jobId: string | null;
  };
  currentJobId: string | null;
  nextJobId: string | null;
  nextJobStart: string | null;
};

export type OperationsMapPermissions = {
  canManageSchedule: boolean;
  canManageJobs: boolean;
  canViewAllCrews: boolean;
};

export type OperationsMapPayload = {
  orgId: string;
  generatedAt: string;
  jobs: OperationsMapJob[];
  crews: OperationsMapCrew[];
  permissions: OperationsMapPermissions;
  thresholds: {
    idleMinutes: number;
    riskStartMinutes: number;
  };
};
