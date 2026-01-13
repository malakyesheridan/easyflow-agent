export type OperationsSignalSeverity = 'info' | 'warning' | 'critical';
export type OperationsSignalStatus = 'open' | 'acknowledged' | 'resolved';
export type OperationsSignalEntityType = 'job' | 'crew';
export type OperationsSignalType = OperationsSignalEntityType | 'system';

export type OperationsSignalDeepLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type OperationsSignal = {
  id: string;
  type: OperationsSignalType;
  severity: OperationsSignalSeverity;
  title: string;
  description: string;
  entityType: OperationsSignalEntityType;
  entityId: string;
  detectedAt: string;
  metadata?: Record<string, unknown>;
  headline: string;
  reason: string;
  evidence: Record<string, unknown>;
  recommendedActions: string[];
  deepLinks: OperationsSignalDeepLink[];
  createdAt: string;
  status: OperationsSignalStatus;
  signalEventId: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  acknowledgedByUserId: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  notes: string | null;
};

export type OperationsIntelligencePermissions = {
  canManageSchedule: boolean;
  canManageJobs: boolean;
  canViewAllCrews: boolean;
};

export type OperationsIntelligenceEntities = {
  jobs: Array<{
    id: string;
    title: string;
    status: string;
    progressStatus: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    address: string;
    shortAddress: string;
    latitude: number | null;
    longitude: number | null;
    crew: Array<{ id: string; name: string }>;
  }>;
  crews: Array<{
    id: string;
    name: string;
    role: string | null;
    state: string;
    idleMinutes: number | null;
    idleRisk: boolean;
    location: {
      lat: number | null;
      lng: number | null;
      address: string | null;
      source: string;
      jobId: string | null;
    };
    currentJobId: string | null;
    nextJobId: string | null;
    nextJobStart: string | null;
  }>;
};

export type OperationsIntelligenceScoreboard = {
  atRiskJobs: number;
  idleCrews: number;
  openCriticalSignals: number;
  avgTimeToAckMinutes: number | null;
};

export type OperationsJobHealthStatus = 'healthy' | 'watch' | 'at_risk';

export type JobHealth = {
  jobId: string;
  status: OperationsJobHealthStatus;
  reasons: string[];
};

export type CrewRiskState = {
  crewId: string;
  status: OperationsJobHealthStatus;
  reasons: string[];
};

export type OperationsIntelligenceThresholds = {
  lateRiskMinutes: number;
  idleThresholdMinutes: number;
  staleLocationMinutes: number;
  riskRadiusKm: number;
  noProgressMinutes: number;
  noMaterialsMinutes: number;
  enRouteDelayMinutes: number;
  hoursOverageMultiplier: number;
  timeRiskCriticalMultiplier: number;
  defaultJobDurationMinutes: number;
  marginWarningPercent: number;
  marginCriticalPercent: number;
  unassignedWarningDays: number;
  crewSwapWindowMinutes: number;
};

export type OperationsIntelligencePayload = {
  orgId: string;
  generatedAt: string;
  evaluatedAt: string;
  signals: OperationsSignal[];
  jobHealth: JobHealth[];
  crewRisks: CrewRiskState[];
  entities: OperationsIntelligenceEntities;
  scoreboard: OperationsIntelligenceScoreboard;
  thresholds: OperationsIntelligenceThresholds;
  permissions: OperationsIntelligencePermissions;
};
