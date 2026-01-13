'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chip from '@/components/ui/Chip';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import DashboardActivityFeed, { type DashboardActivityItem } from '@/components/dashboard/DashboardActivityFeed';
import DashboardTodaySnapshot from '@/components/dashboard/DashboardTodaySnapshot';
import type { Job } from '@/db/schema/jobs';
import type { CrewMember } from '@/db/schema/crew_members';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { getCrewDisplayName } from '@/lib/utils/crewMetrics';
import { cn } from '@/lib/utils';
import {
  buildOrgDayKeySet,
  computePeriodMetrics,
  deltaPercent,
  formatMinutes,
  getRangeForMode,
  getPeriodLengthDays,
  type DashboardMode,
} from '@/lib/utils/dashboardMetrics';
import { getOrgDayKey } from '@/lib/utils/scheduleDayOwnership';
import { formatQuantity } from '@/lib/utils/quantity';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { useSession } from '@/hooks/useSession';

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: any };
type ApiResponse<T> = ApiOk<T> | ApiErr;

function decodeAssignments(raw: any[]): ScheduleAssignmentWithJob[] {
  return raw.map((a) => ({
    ...a,
    date: new Date(a.date),
    scheduledStart: new Date(a.scheduledStart),
    scheduledEnd: new Date(a.scheduledEnd),
    job: {
      ...a.job,
      createdAt: new Date(a.job.createdAt),
      updatedAt: new Date(a.job.updatedAt),
      scheduledStart: a.job.scheduledStart ? new Date(a.job.scheduledStart) : null,
      scheduledEnd: a.job.scheduledEnd ? new Date(a.job.scheduledEnd) : null,
    },
  }));
}

function decodeJobs(raw: any[]): Job[] {
  return raw.map((j) => ({
    ...j,
    createdAt: new Date(j.createdAt),
    updatedAt: new Date(j.updatedAt),
    scheduledStart: j.scheduledStart ? new Date(j.scheduledStart) : null,
    scheduledEnd: j.scheduledEnd ? new Date(j.scheduledEnd) : null,
  }));
}

function decodeCrewMembers(raw: any[]): CrewMember[] {
  return raw.map((m) => ({
    ...m,
    createdAt: new Date(m.createdAt),
    updatedAt: new Date(m.updatedAt),
  }));
}

function decodeInstallStats(raw: any[]): CrewInstallStatsRow[] {
  const toNum = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  return raw.map((row) => ({
    crewMemberId: String(row.crewMemberId),
    m2Total7d: toNum(row.m2Total7d),
    minutesTotal7d: toNum(row.minutesTotal7d),
    m2PerMinute7d: toNum(row.m2PerMinute7d),
    m2Total30d: toNum(row.m2Total30d),
    minutesTotal30d: toNum(row.minutesTotal30d),
    m2PerMinute30d: toNum(row.m2PerMinute30d),
    m2Total90d: toNum(row.m2Total90d),
    minutesTotal90d: toNum(row.minutesTotal90d),
    m2PerMinute90d: toNum(row.m2PerMinute90d),
    computedAt: row.computedAt ? new Date(row.computedAt) : new Date(),
  }));
}

type MaterialUsageSummary = {
  startDate: string;
  endDate: string;
  unitTotals: Array<{ unit: string; totalUsed: number; logCount: number }>;
  distinctUnits: number;
  totalLogs: number;
};

type CrewInstallStatsRow = {
  crewMemberId: string;
  m2Total7d: number;
  minutesTotal7d: number;
  m2PerMinute7d: number;
  m2Total30d: number;
  minutesTotal30d: number;
  m2PerMinute30d: number;
  m2Total90d: number;
  minutesTotal90d: number;
  m2PerMinute90d: number;
  computedAt: Date;
};

type MaterialUsageByMode = {
  summary: MaterialUsageSummary;
  previous: MaterialUsageSummary;
  displayUnit: string | null;
  displayTotal: number;
  previousTotal: number;
  delta: { direction: 'up' | 'down' | 'flat'; percent: number | null };
};

type IntegrationMetrics = {
  payments: { totalCents: number; count: number };
  outstandingInvoices: number;
  lowStockAlerts: number;
  failedEvents: number;
};

type ProfitabilityMetrics = {
  averageMarginPercent: number | null;
  worstJobs: Array<{
    jobId: string;
    title: string;
    marginPercent: number | null;
    profitCents: number;
    revenueCents: number;
    costCents: number;
  }>;
  bestJobTypes: Array<{
    jobTypeId: string;
    label: string;
    averageMarginPercent: number | null;
    jobCount: number;
  }>;
  marginTrend: Array<{
    label: string;
    marginPercent: number | null;
  }>;
};

type DashboardGroupId = 'operations' | 'financial' | 'profitability' | 'productivity' | 'period' | 'detail';

type DashboardItemId =
  | 'ops_jobs_scheduled'
  | 'ops_jobs_completed'
  | 'ops_jobs_overdue'
  | 'ops_crews_active'
  | 'ops_utilisation'
  | 'ops_materials_used'
  | 'finance_payments_collected'
  | 'finance_outstanding_invoices'
  | 'finance_low_stock'
  | 'finance_automation_health'
  | 'profit_avg_margin'
  | 'profit_worst_jobs'
  | 'profit_best_job_types'
  | 'profit_margin_trend'
  | 'productivity_team_avg'
  | 'productivity_fastest'
  | 'productivity_slowest'
  | 'period_completion'
  | 'period_avg_duration'
  | 'period_avg_jobs_per_crew'
  | 'detail_today_snapshot'
  | 'detail_activity_feed';

type DashboardItemDefinition = {
  id: DashboardItemId;
  label: string;
  description: string;
  group: DashboardGroupId;
};

const DASHBOARD_GROUPS: Array<{ id: DashboardGroupId; title: string; description: string }> = [
  {
    id: 'operations',
    title: 'Operations overview',
    description: 'Schedule health, crews, and materials usage.',
  },
  {
    id: 'financial',
    title: 'Financial and system health',
    description: 'Billing, inventory, and automation signals.',
  },
  {
    id: 'profitability',
    title: 'Profitability',
    description: 'Margins, risk exposure, and trend direction.',
  },
  {
    id: 'productivity',
    title: 'Install productivity',
    description: 'Team speed and individual trends.',
  },
  {
    id: 'period',
    title: 'Period diagnostics',
    description: 'Completion rates and workload balance.',
  },
  {
    id: 'detail',
    title: 'Operations detail',
    description: 'Crew timelines and recent activity.',
  },
];

const DASHBOARD_ITEMS: DashboardItemDefinition[] = [
  {
    id: 'ops_jobs_scheduled',
    label: 'Jobs scheduled',
    description: 'Distinct jobs on the schedule for the period.',
    group: 'operations',
  },
  {
    id: 'ops_jobs_completed',
    label: 'Jobs completed',
    description: 'Jobs marked completed in the period.',
    group: 'operations',
  },
  {
    id: 'ops_jobs_overdue',
    label: 'Jobs overdue',
    description: 'Jobs past scheduled end and not completed.',
    group: 'operations',
  },
  {
    id: 'ops_crews_active',
    label: 'Crews active',
    description: 'Crews with work scheduled.',
    group: 'operations',
  },
  {
    id: 'ops_utilisation',
    label: 'Total utilisation',
    description: 'Scheduled minutes across available time.',
    group: 'operations',
  },
  {
    id: 'ops_materials_used',
    label: 'Materials used',
    description: 'Usage logged in the warehouse.',
    group: 'operations',
  },
  {
    id: 'finance_payments_collected',
    label: 'Payments collected',
    description: 'Collected payments over the last 7 days.',
    group: 'financial',
  },
  {
    id: 'finance_outstanding_invoices',
    label: 'Outstanding invoices',
    description: 'Draft and sent invoices still open.',
    group: 'financial',
  },
  {
    id: 'finance_low_stock',
    label: 'Low stock alerts',
    description: 'Warehouse alerts that need attention.',
    group: 'financial',
  },
  {
    id: 'finance_automation_health',
    label: 'Automation health',
    description: 'Failed automations in the last 7 days.',
    group: 'financial',
  },
  {
    id: 'profit_avg_margin',
    label: 'Average margin',
    description: 'Average margin across the period.',
    group: 'profitability',
  },
  {
    id: 'profit_worst_jobs',
    label: 'Worst margin jobs',
    description: 'Lowest margin jobs to review.',
    group: 'profitability',
  },
  {
    id: 'profit_best_job_types',
    label: 'Best job types',
    description: 'Highest margin job types.',
    group: 'profitability',
  },
  {
    id: 'profit_margin_trend',
    label: 'Margin trend',
    description: 'Average margin by period bucket.',
    group: 'profitability',
  },
  {
    id: 'productivity_team_avg',
    label: 'Team average speed',
    description: 'Average install speed across the team.',
    group: 'productivity',
  },
  {
    id: 'productivity_fastest',
    label: 'Fastest trend',
    description: 'Crew member with the best trend.',
    group: 'productivity',
  },
  {
    id: 'productivity_slowest',
    label: 'Slowest trend',
    description: 'Crew member that needs coaching.',
    group: 'productivity',
  },
  {
    id: 'period_completion',
    label: 'Completion rate',
    description: 'Percent of scheduled work completed.',
    group: 'period',
  },
  {
    id: 'period_avg_duration',
    label: 'Average duration',
    description: 'Average scheduled duration per job.',
    group: 'period',
  },
  {
    id: 'period_avg_jobs_per_crew',
    label: 'Average jobs per crew',
    description: 'Workload distribution across crews.',
    group: 'period',
  },
  {
    id: 'detail_today_snapshot',
    label: 'Today snapshot',
    description: 'Crew timelines with travel buffers.',
    group: 'detail',
  },
  {
    id: 'detail_activity_feed',
    label: 'Activity feed',
    description: 'Recent changes across jobs and warehouse.',
    group: 'detail',
  },
];

const DEFAULT_ENABLED_ITEMS = DASHBOARD_ITEMS.map((item) => item.id);
const DEFAULT_SECTION_ORDER = DASHBOARD_GROUPS.map((group) => group.id);
const DASHBOARD_GROUP_ID_SET = new Set<DashboardGroupId>(DEFAULT_SECTION_ORDER);
const DASHBOARD_GROUP_BY_ID = new Map(DASHBOARD_GROUPS.map((group) => [group.id, group]));
const DASHBOARD_SELECTION_GROUPS = DASHBOARD_GROUPS.map((group) => ({
  ...group,
  items: DASHBOARD_ITEMS.filter((item) => item.group === group.id),
}));

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function getCurrentAndPreviousRanges(mode: DashboardMode, now: Date) {
  const days = getPeriodLengthDays(mode);
  const end = addDays(startOfDay(now), 1);
  const start = addDays(end, -days);
  const previousEnd = start;
  const previousStart = addDays(previousEnd, -days);
  return {
    current: { start, end },
    previous: { start: previousStart, end: previousEnd },
    days,
  };
}

function getUnitTotal(summary: MaterialUsageSummary, unit: string): number {
  const row = summary.unitTotals.find((u) => u.unit === unit);
  return Number(row?.totalUsed ?? 0);
}

function decodeActivity(raw: any[]): DashboardActivityItem[] {
  return raw.map((item) => ({
    ...item,
    createdAt: new Date(item.createdAt),
  }));
}

function formatRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function formatCents(value: number, currency: string = 'AUD'): string {
  if (!Number.isFinite(value)) return '--';
  return `${currency} ${(value / 100).toFixed(2)}`;
}

function formatPercentValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}%`;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 h-6 w-1 rounded-full bg-accent-gold/70" aria-hidden="true" />
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-text-tertiary">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function DashboardView({ orgId }: { orgId: string }) {
  const { config } = useOrgConfig();
  const { session } = useSession();
  const resolvedOrgId = orgId || config?.orgId || '';
  const userId = session?.user?.id ?? 'unknown';
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [enabledItems, setEnabledItems] = useState<Set<DashboardItemId>>(
    () => new Set(DEFAULT_ENABLED_ITEMS)
  );
  const [sectionOrder, setSectionOrder] = useState<DashboardGroupId[]>(
    () => [...DEFAULT_SECTION_ORDER]
  );
  const storageKey = useMemo(
    () => `dashboard.items.${resolvedOrgId || 'org'}.${userId}`,
    [resolvedOrgId, userId]
  );
  const [mode, setMode] = useState<DashboardMode>('today');
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [integrationMetrics, setIntegrationMetrics] = useState<IntegrationMetrics | null>(null);
  const [integrationMetricsError, setIntegrationMetricsError] = useState<string | null>(null);

  const profitabilityByModeRef = useRef(new Map<DashboardMode, ProfitabilityMetrics>());
  const [profitabilityVersion, setProfitabilityVersion] = useState(0);
  const [profitabilityLoadingMode, setProfitabilityLoadingMode] = useState<DashboardMode | null>('today');
  const [profitabilityError, setProfitabilityError] = useState<string | null>(null);

  const [crews, setCrews] = useState<CrewMember[] | null>(null);
  const [crewsError, setCrewsError] = useState<string | null>(null);

  const [installStats, setInstallStats] = useState<CrewInstallStatsRow[] | null>(null);
  const [installStatsError, setInstallStatsError] = useState<string | null>(null);

  const assignmentsByModeRef = useRef(new Map<DashboardMode, ScheduleAssignmentWithJob[]>());
  const [assignmentsVersion, setAssignmentsVersion] = useState(0);
  const [loadingMode, setLoadingMode] = useState<DashboardMode | null>('today');
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  const usageByModeRef = useRef(new Map<DashboardMode, MaterialUsageByMode>());
  const [usageVersion, setUsageVersion] = useState(0);
  const [usageLoadingMode, setUsageLoadingMode] = useState<DashboardMode | null>('today');
  const [usageError, setUsageError] = useState<string | null>(null);

  const activityByModeRef = useRef(new Map<DashboardMode, DashboardActivityItem[]>());
  const [activityVersion, setActivityVersion] = useState(0);
  const [activityLoadingMode, setActivityLoadingMode] = useState<DashboardMode | null>('today');
  const [activityError, setActivityError] = useState<string | null>(null);
  const itemIdSet = useMemo(() => new Set(DASHBOARD_ITEMS.map((item) => item.id)), []);

  const getAssignmentsForMode = useCallback((m: DashboardMode) => {
    return assignmentsByModeRef.current.get(m) || null;
  }, []);

  const getUsageForMode = useCallback((m: DashboardMode) => {
    return usageByModeRef.current.get(m) || null;
  }, []);

  const getActivityForMode = useCallback((m: DashboardMode) => {
    return activityByModeRef.current.get(m) || null;
  }, []);

  const getProfitabilityForMode = useCallback((m: DashboardMode) => {
    return profitabilityByModeRef.current.get(m) || null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPrefsLoaded(false);
    const raw = window.localStorage.getItem(storageKey);
    let nextItems: DashboardItemId[] | null = null;
    let nextOrder: DashboardGroupId[] | null = null;

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          nextItems = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray((parsed as { items?: unknown }).items)) {
            nextItems = (parsed as { items: DashboardItemId[] }).items;
          }
          if (Array.isArray((parsed as { order?: unknown }).order)) {
            nextOrder = (parsed as { order: DashboardGroupId[] }).order;
          }
        }
      } catch {
        nextItems = null;
        nextOrder = null;
      }
    }

    const resolvedItems = (nextItems ?? DEFAULT_ENABLED_ITEMS).filter((id): id is DashboardItemId => itemIdSet.has(id));
    const resolvedOrder = (nextOrder ?? DEFAULT_SECTION_ORDER).filter((id): id is DashboardGroupId => DASHBOARD_GROUP_ID_SET.has(id));
    const normalizedOrder = [...resolvedOrder];
    for (const id of DEFAULT_SECTION_ORDER) {
      if (!normalizedOrder.includes(id)) normalizedOrder.push(id);
    }

    setEnabledItems(new Set(resolvedItems));
    setSectionOrder(normalizedOrder.length > 0 ? normalizedOrder : [...DEFAULT_SECTION_ORDER]);
    setPrefsLoaded(true);
    setLoadedKey(storageKey);
  }, [itemIdSet, storageKey]);

  useEffect(() => {
    if (!prefsLoaded || loadedKey !== storageKey) return;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ items: Array.from(enabledItems), order: sectionOrder })
    );
  }, [enabledItems, loadedKey, prefsLoaded, sectionOrder, storageKey]);

  const toggleItem = useCallback((id: DashboardItemId) => {
    setEnabledItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const resetDefaults = useCallback(() => {
    setEnabledItems(new Set(DEFAULT_ENABLED_ITEMS));
    setSectionOrder([...DEFAULT_SECTION_ORDER]);
  }, []);

  const moveSection = useCallback((id: DashboardGroupId, direction: 'up' | 'down') => {
    setSectionOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return next;
    });
  }, []);

  const isItemEnabled = useCallback((id: DashboardItemId) => enabledItems.has(id), [enabledItems]);

  const fetchJobsOnce = useCallback(async () => {
    try {
      setJobsError(null);
      const res = await fetch(`/api/jobs?orgId=${resolvedOrgId}&all=true`, { method: 'GET' });
      const json = (await res.json()) as ApiResponse<any[]>;
      if (!res.ok || !json.ok) {
        setJobsError('Failed to load jobs');
        setJobs([]);
        return;
      }
      setJobs(decodeJobs(json.data));
    } catch {
      setJobsError('Failed to load jobs');
      setJobs([]);
    }
  }, [resolvedOrgId]);

  const fetchCrewsOnce = useCallback(async () => {
    if (crews !== null) return;
    try {
      setCrewsError(null);
      const res = await fetch(`/api/crews?orgId=${resolvedOrgId}&activeOnly=true`, { method: 'GET' });
      const json = (await res.json()) as ApiResponse<any[]>;
      if (!res.ok || !json.ok) {
        setCrewsError('Failed to load crews');
        setCrews([]);
        return;
      }
      setCrews(decodeCrewMembers(json.data));
    } catch {
      setCrewsError('Failed to load crews');
      setCrews([]);
    }
  }, [crews, resolvedOrgId]);

  const fetchInstallStatsOnce = useCallback(async () => {
    if (installStats !== null) return;
    try {
      setInstallStatsError(null);
      const res = await fetch(`/api/crew-install-stats?orgId=${resolvedOrgId}&recompute=true`, { method: 'GET' });
      const json = (await res.json()) as ApiResponse<any[]>;
      if (!res.ok || !json.ok) {
        setInstallStatsError('Failed to load install stats');
        setInstallStats([]);
        return;
      }
      setInstallStats(decodeInstallStats(json.data));
    } catch {
      setInstallStatsError('Failed to load install stats');
      setInstallStats([]);
    }
  }, [installStats, resolvedOrgId]);

  const fetchAssignmentsForMode = useCallback(
    async (m: DashboardMode) => {
      if (assignmentsByModeRef.current.has(m)) return;
      try {
        setAssignmentsError(null);
        setLoadingMode(m);
        const { start, end } = getRangeForMode(m, new Date());
        const url = `/api/schedule-assignments?orgId=${resolvedOrgId}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
        const res = await fetch(url, { method: 'GET' });
        const json = (await res.json()) as ApiResponse<any[]>;
        if (!res.ok || !json.ok) {
          setAssignmentsError('Failed to load schedule assignments');
          assignmentsByModeRef.current.set(m, []);
          setAssignmentsVersion(v => v + 1);
          return;
        }
        assignmentsByModeRef.current.set(m, decodeAssignments(json.data));
        setAssignmentsVersion(v => v + 1);
      } catch {
        setAssignmentsError('Failed to load schedule assignments');
        assignmentsByModeRef.current.set(m, []);
        setAssignmentsVersion(v => v + 1);
      } finally {
        setLoadingMode(null);
      }
    },
    [resolvedOrgId]
  );

  const fetchUsageForMode = useCallback(
    async (m: DashboardMode) => {
      if (usageByModeRef.current.has(m)) return;
      try {
        setUsageError(null);
        setUsageLoadingMode(m);

        const ranges = getCurrentAndPreviousRanges(m, new Date());
        const currentUrl = `/api/materials/usage-summary?orgId=${resolvedOrgId}&startDate=${ranges.current.start.toISOString()}&endDate=${ranges.current.end.toISOString()}`;
        const prevUrl = `/api/materials/usage-summary?orgId=${resolvedOrgId}&startDate=${ranges.previous.start.toISOString()}&endDate=${ranges.previous.end.toISOString()}`;

        const [currentRes, prevRes] = await Promise.all([fetch(currentUrl), fetch(prevUrl)]);
        const currentJson = (await currentRes.json()) as ApiResponse<MaterialUsageSummary>;
        const prevJson = (await prevRes.json()) as ApiResponse<MaterialUsageSummary>;

        if (!currentRes.ok || !currentJson.ok || !prevRes.ok || !prevJson.ok) {
          setUsageError('Failed to load warehouse usage');
          usageByModeRef.current.set(m, {
            summary: { startDate: ranges.current.start.toISOString(), endDate: ranges.current.end.toISOString(), unitTotals: [], distinctUnits: 0, totalLogs: 0 },
            previous: { startDate: ranges.previous.start.toISOString(), endDate: ranges.previous.end.toISOString(), unitTotals: [], distinctUnits: 0, totalLogs: 0 },
            displayUnit: null,
            displayTotal: 0,
            previousTotal: 0,
            delta: { direction: 'flat', percent: 0 },
          });
          setUsageVersion((v) => v + 1);
          return;
        }

        const summary = currentJson.data;
        const previous = prevJson.data;
        const displayUnit = summary.unitTotals[0]?.unit ?? previous.unitTotals[0]?.unit ?? null;
        const displayTotal = displayUnit ? getUnitTotal(summary, displayUnit) : 0;
        const previousTotal = displayUnit ? getUnitTotal(previous, displayUnit) : 0;

        usageByModeRef.current.set(m, {
          summary,
          previous,
          displayUnit,
          displayTotal,
          previousTotal,
          delta: deltaPercent(displayTotal, previousTotal),
        });
        setUsageVersion((v) => v + 1);
      } catch {
        setUsageError('Failed to load warehouse usage');
        usageByModeRef.current.set(m, {
          summary: { startDate: new Date().toISOString(), endDate: new Date().toISOString(), unitTotals: [], distinctUnits: 0, totalLogs: 0 },
          previous: { startDate: new Date().toISOString(), endDate: new Date().toISOString(), unitTotals: [], distinctUnits: 0, totalLogs: 0 },
          displayUnit: null,
          displayTotal: 0,
          previousTotal: 0,
          delta: { direction: 'flat', percent: 0 },
        });
        setUsageVersion((v) => v + 1);
      } finally {
        setUsageLoadingMode(null);
      }
    },
    [resolvedOrgId]
  );

  const fetchActivityForMode = useCallback(
    async (m: DashboardMode) => {
      if (activityByModeRef.current.has(m)) return;
      try {
        setActivityError(null);
        setActivityLoadingMode(m);
        const { current } = getCurrentAndPreviousRanges(m, new Date());
        const url = `/api/dashboard/activity?orgId=${resolvedOrgId}&startDate=${current.start.toISOString()}&endDate=${current.end.toISOString()}&limit=50`;
        const res = await fetch(url, { method: 'GET' });
        const json = (await res.json()) as ApiResponse<any[]>;
        if (!res.ok || !json.ok) {
          setActivityError('Failed to load activity feed');
          activityByModeRef.current.set(m, []);
          setActivityVersion((v) => v + 1);
          return;
        }
        activityByModeRef.current.set(m, decodeActivity(json.data));
        setActivityVersion((v) => v + 1);
      } catch {
        setActivityError('Failed to load activity feed');
        activityByModeRef.current.set(m, []);
        setActivityVersion((v) => v + 1);
      } finally {
        setActivityLoadingMode(null);
      }
    },
    [resolvedOrgId]
  );

  const fetchProfitabilityForMode = useCallback(
    async (m: DashboardMode) => {
      if (profitabilityByModeRef.current.has(m)) return;
      try {
        setProfitabilityError(null);
        setProfitabilityLoadingMode(m);
        const ranges = getCurrentAndPreviousRanges(m, new Date());
        const url = `/api/dashboard/profitability?orgId=${resolvedOrgId}&startDate=${ranges.current.start.toISOString()}&endDate=${ranges.current.end.toISOString()}`;
        const res = await fetch(url, { method: 'GET' });
        const json = (await res.json()) as ApiResponse<ProfitabilityMetrics>;
        if (!res.ok || !json.ok) {
          setProfitabilityError('Failed to load profitability');
          profitabilityByModeRef.current.set(m, {
            averageMarginPercent: null,
            worstJobs: [],
            bestJobTypes: [],
            marginTrend: [],
          });
          setProfitabilityVersion((v) => v + 1);
          return;
        }
        profitabilityByModeRef.current.set(m, json.data);
        setProfitabilityVersion((v) => v + 1);
      } catch {
        setProfitabilityError('Failed to load profitability');
        profitabilityByModeRef.current.set(m, {
          averageMarginPercent: null,
          worstJobs: [],
          bestJobTypes: [],
          marginTrend: [],
        });
        setProfitabilityVersion((v) => v + 1);
      } finally {
        setProfitabilityLoadingMode(null);
      }
    },
    [resolvedOrgId]
  );

  const fetchIntegrationMetrics = useCallback(async () => {
    try {
      setIntegrationMetricsError(null);
      const res = await fetch(`/api/dashboard/integration-metrics?orgId=${resolvedOrgId}&days=7`, { method: 'GET' });
      const json = (await res.json()) as ApiResponse<IntegrationMetrics>;
      if (!res.ok || !json.ok) {
        setIntegrationMetricsError('Failed to load integration metrics');
        setIntegrationMetrics(null);
        return;
      }
      setIntegrationMetrics(json.data);
    } catch {
      setIntegrationMetricsError('Failed to load integration metrics');
      setIntegrationMetrics(null);
    }
  }, [resolvedOrgId]);

  useEffect(() => {
    fetchJobsOnce();
  }, [fetchJobsOnce]);

  useEffect(() => {
    fetchCrewsOnce();
  }, [fetchCrewsOnce]);

  useEffect(() => {
    fetchInstallStatsOnce();
  }, [fetchInstallStatsOnce]);

  useEffect(() => {
    fetchAssignmentsForMode(mode);
  }, [fetchAssignmentsForMode, mode]);

  useEffect(() => {
    fetchUsageForMode(mode);
  }, [fetchUsageForMode, mode]);

  useEffect(() => {
    fetchActivityForMode(mode);
  }, [fetchActivityForMode, mode]);

  useEffect(() => {
    fetchIntegrationMetrics();
  }, [fetchIntegrationMetrics]);

  useEffect(() => {
    fetchProfitabilityForMode(mode);
  }, [fetchProfitabilityForMode, mode]);

  const now = new Date();
  const assignments = getAssignmentsForMode(mode);
  const usage = getUsageForMode(mode);
  const activity = getActivityForMode(mode);
  const profitability = getProfitabilityForMode(mode);

  const safeJobs = useMemo(() => jobs ?? [], [jobs]);
  const safeAssignments = useMemo(() => assignments ?? [], [assignments]);
  const safeCrews = useMemo(() => crews ?? [], [crews]);
  const safeInstallStats = useMemo(() => installStats ?? [], [installStats]);

  const crewNameById = useMemo(() => {
    const map = new Map<string, string>();
    safeCrews.forEach((crew) => {
      map.set(crew.id, getCrewDisplayName(crew));
    });
    return map;
  }, [safeCrews]);

  const isInitialLoading = jobs === null || crews === null || assignments === null;
  if (isInitialLoading) {
    return <DashboardSkeleton />;
  }

  const { days } = getCurrentAndPreviousRanges(mode, now);

  const currentKeys = buildOrgDayKeySet(now, days);
  const currentAssignments = safeAssignments.filter((a) => currentKeys.has(getOrgDayKey(a.date)));

  const jobsScheduled = new Set(currentAssignments.map((a) => a.jobId)).size;
  const crewsActive = new Set(currentAssignments.map((a) => a.crewId).filter((crewId): crewId is string => Boolean(crewId))).size;
  const jobsCompleted = safeJobs.filter((j) => j.status === 'completed' && currentKeys.has(getOrgDayKey(j.updatedAt))).length;

  const jobsOverdue = currentAssignments.filter((a) => {
    const jobCompleted = a.job?.status === 'completed';
    const assignmentCompleted = a.status === 'completed';
    if (jobCompleted || assignmentCompleted) return false;
    return now.getTime() > new Date(a.scheduledEnd).getTime();
  }).length;

  const scheduledMinutes = currentAssignments.reduce((sum, a) => sum + Math.max(0, a.endMinutes - a.startMinutes), 0);
  const capacityMinutes = days * safeCrews.reduce((sum, c) => sum + (c.dailyCapacityMinutes ?? 0), 0);
  const utilisationPct = capacityMinutes > 0 ? Math.round((scheduledMinutes / capacityMinutes) * 100) : 0;

  const utilisationEmphasis = utilisationPct >= 110 ? 'danger' : utilisationPct >= 90 ? 'warning' : 'normal';

  const periodMetrics =
    mode === 'today'
      ? null
      : computePeriodMetrics({ now, mode: mode as Exclude<DashboardMode, 'today'>, jobs: safeJobs, assignments: safeAssignments });

  const usageCardSubtitle = (() => {
    if (!usage) return 'Derived from usage logs';
    if (usage.displayUnit === null) return 'No usage logged';
    if (usage.summary.distinctUnits > 1) return `Mixed units (top: ${usage.displayUnit})`;
    return 'Derived from usage logs';
  })();

  const installTeamM2 = safeInstallStats.reduce((sum, row) => sum + row.m2Total30d, 0);
  const installTeamMinutes = safeInstallStats.reduce((sum, row) => sum + row.minutesTotal30d, 0);
  const installTeamRate = installTeamMinutes > 0 ? installTeamM2 / installTeamMinutes : 0;

  const rateRows = safeInstallStats.filter((row) => row.m2PerMinute30d > 0 && row.minutesTotal30d > 0);
  const fastest = rateRows.reduce<CrewInstallStatsRow | null>((best, row) => {
    if (!best || row.m2PerMinute30d > best.m2PerMinute30d) return row;
    return best;
  }, null);
  const slowest = rateRows.reduce<CrewInstallStatsRow | null>((best, row) => {
    if (!best || row.m2PerMinute30d < best.m2PerMinute30d) return row;
    return best;
  }, null);

  const crewSingular = config?.vocabulary?.crewSingular ?? 'Crew';
  const fastestName = fastest ? crewNameById.get(fastest.crewMemberId) || `${crewSingular} ${fastest.crewMemberId.slice(0, 8)}` : null;
  const slowestName = slowest ? crewNameById.get(slowest.crewMemberId) || `${crewSingular} ${slowest.crewMemberId.slice(0, 8)}` : null;
  const fastestTrend = fastest ? deltaPercent(fastest.m2PerMinute7d, fastest.m2PerMinute30d) : undefined;
  const slowestTrend = slowest ? deltaPercent(slowest.m2PerMinute7d, slowest.m2PerMinute30d) : undefined;

  const paymentsValue = integrationMetrics ? formatCents(integrationMetrics.payments.totalCents) : '--';
  const paymentsSubtitle = integrationMetrics
    ? `${integrationMetrics.payments.count} payment${integrationMetrics.payments.count === 1 ? '' : 's'} (7d)`
    : 'Stripe payments (7d)';
  const outstandingInvoices = integrationMetrics?.outstandingInvoices ?? 0;
  const lowStockAlerts = integrationMetrics?.lowStockAlerts ?? 0;
  const failedEvents = integrationMetrics?.failedEvents ?? 0;

  const avgMargin = profitability?.averageMarginPercent ?? null;
  const marginWarning = config?.marginWarningPercent ?? 30;
  const marginCritical = config?.marginCriticalPercent ?? 20;
  const avgMarginEmphasis =
    avgMargin === null
      ? 'normal'
      : avgMargin <= marginCritical
        ? 'danger'
        : avgMargin <= marginWarning
          ? 'warning'
          : 'normal';
  const trendPoints = profitability?.marginTrend ?? [];
  const trendMax = trendPoints.reduce((max, point) => Math.max(max, point.marginPercent ?? 0), 0);
  const showOperationsSection =
    isItemEnabled('ops_jobs_scheduled') ||
    isItemEnabled('ops_jobs_completed') ||
    isItemEnabled('ops_jobs_overdue') ||
    isItemEnabled('ops_crews_active') ||
    isItemEnabled('ops_utilisation') ||
    isItemEnabled('ops_materials_used');
  const showFinancialSection =
    isItemEnabled('finance_payments_collected') ||
    isItemEnabled('finance_outstanding_invoices') ||
    isItemEnabled('finance_low_stock') ||
    isItemEnabled('finance_automation_health');
  const showProfitabilitySection =
    isItemEnabled('profit_avg_margin') ||
    isItemEnabled('profit_worst_jobs') ||
    isItemEnabled('profit_best_job_types') ||
    isItemEnabled('profit_margin_trend');
  const showProfitabilityGrid =
    isItemEnabled('profit_avg_margin') ||
    isItemEnabled('profit_worst_jobs') ||
    isItemEnabled('profit_best_job_types');
  const showProfitabilityTrend = isItemEnabled('profit_margin_trend');
  const showProductivitySection =
    isItemEnabled('productivity_team_avg') ||
    isItemEnabled('productivity_fastest') ||
    isItemEnabled('productivity_slowest');
  const showPeriodSection =
    Boolean(periodMetrics) &&
    (isItemEnabled('period_completion') ||
      isItemEnabled('period_avg_duration') ||
      isItemEnabled('period_avg_jobs_per_crew'));
  const showDetailSnapshot = mode === 'today' && isItemEnabled('detail_today_snapshot');
  const showDetailActivity = isItemEnabled('detail_activity_feed');
  const showDetailSection = showDetailSnapshot || showDetailActivity;
  const detailTwoCols = showDetailSnapshot && showDetailActivity;
  const getSectionOrderIndex = (id: DashboardGroupId) => {
    const idx = sectionOrder.indexOf(id);
    if (idx !== -1) return idx;
    return DEFAULT_SECTION_ORDER.indexOf(id);
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={mode === 'today'} onClick={() => setMode('today')}>
            Today
          </Chip>
          <Chip active={mode === 'week'} onClick={() => setMode('week')}>
            Week
          </Chip>
          <Chip active={mode === 'month'} onClick={() => setMode('month')}>
            Month
          </Chip>
          <Chip active={mode === 'year'} onClick={() => setMode('year')}>
            Last 12 months
          </Chip>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCustomizeOpen(true)}>
          Customize
        </Button>
      </div>

      {(jobsError || crewsError || assignmentsError || usageError || activityError || installStatsError || integrationMetricsError || profitabilityError) && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
          {jobsError ||
            crewsError ||
            assignmentsError ||
            usageError ||
            activityError ||
            installStatsError ||
            integrationMetricsError ||
            profitabilityError}
        </div>
      )}

      <div className="flex flex-col gap-10">
      {showOperationsSection && (
        <section className="space-y-4" style={{ order: getSectionOrderIndex('operations') }}>
          <SectionHeader title="Operations overview" subtitle="Schedule, crews, and materials for the selected period." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {isItemEnabled('ops_jobs_scheduled') && (
              <DashboardMetricCard
                title={
                  mode === 'today'
                    ? `${config?.vocabulary?.jobPlural ?? 'Jobs'} Scheduled Today`
                    : `${config?.vocabulary?.jobPlural ?? 'Jobs'} Scheduled`
                }
                value={String(jobsScheduled)}
                subtitle={mode === 'today' ? 'Distinct jobs on the schedule' : 'Distinct jobs scheduled in period'}
                delta={periodMetrics?.trend}
              />
            )}
            {isItemEnabled('ops_jobs_completed') && (
              <DashboardMetricCard
                title={
                  mode === 'today'
                    ? `${config?.vocabulary?.jobPlural ?? 'Jobs'} Completed Today`
                    : `${config?.vocabulary?.jobPlural ?? 'Jobs'} Completed`
                }
                value={String(jobsCompleted)}
                subtitle={mode === 'today' ? 'Marked completed today' : 'Completed in period'}
              />
            )}
            {isItemEnabled('ops_jobs_overdue') && (
              <DashboardMetricCard
                title={`${config?.vocabulary?.jobPlural ?? 'Jobs'} Overdue`}
                value={String(jobsOverdue)}
                subtitle="Past scheduled end, not completed"
                emphasis={jobsOverdue > 0 ? 'danger' : 'normal'}
              />
            )}
            {isItemEnabled('ops_crews_active') && (
              <DashboardMetricCard
                title={
                  mode === 'today'
                    ? `${config?.vocabulary?.crewPlural ?? 'Crews'} Active Today`
                    : `${config?.vocabulary?.crewPlural ?? 'Crews'} Active`
                }
                value={String(crewsActive)}
                subtitle="Crews with work scheduled"
              />
            )}
            {isItemEnabled('ops_utilisation') && (
              <DashboardMetricCard
                title="Total Utilisation"
                value={`${Math.max(0, utilisationPct)}%`}
                subtitle={`${Math.round(scheduledMinutes)} min scheduled`}
                emphasis={utilisationEmphasis}
              />
            )}
            {isItemEnabled('ops_materials_used') && (
              <DashboardMetricCard
                title={`${config?.vocabulary?.materialPlural ?? 'Materials'} Used`}
                value={usage ? formatQuantity(usage.displayTotal, usage.displayUnit) : 'ƒ?"'}
                subtitle={usageCardSubtitle}
                delta={usage?.delta}
              />
            )}
          </div>
        </section>
      )}

      {showFinancialSection && (
        <section className="space-y-4" style={{ order: getSectionOrderIndex('financial') }}>
          <SectionHeader title="Financial and system health" subtitle="Billing, inventory, and automation signals." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {isItemEnabled('finance_payments_collected') && (
              <DashboardMetricCard
                title="Payments collected (7d)"
                value={paymentsValue}
                subtitle={paymentsSubtitle}
              />
            )}
            {isItemEnabled('finance_outstanding_invoices') && (
              <DashboardMetricCard
                title="Outstanding invoices"
                value={String(outstandingInvoices)}
                subtitle="Xero drafts & sent"
                emphasis={outstandingInvoices > 0 ? 'warning' : 'normal'}
              />
            )}
            {isItemEnabled('finance_low_stock') && (
              <DashboardMetricCard
                title="Low stock alerts"
                value={String(lowStockAlerts)}
                subtitle="Active warehouse alerts"
                emphasis={lowStockAlerts > 0 ? 'warning' : 'normal'}
              />
            )}
            {isItemEnabled('finance_automation_health') && (
              <DashboardMetricCard
                title="Automation health"
                value={String(failedEvents)}
                subtitle="Failed actions (7d)"
                emphasis={failedEvents > 0 ? 'danger' : 'normal'}
              />
            )}
          </div>
        </section>
      )}

      {showProfitabilitySection && (
        <section className="space-y-4" style={{ order: getSectionOrderIndex('profitability') }}>
          <SectionHeader title="Profitability" subtitle="Margins, risk exposure, and trend direction." />
          {showProfitabilityGrid && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {isItemEnabled('profit_avg_margin') && (
                <Card className={cn(avgMarginEmphasis === 'danger' ? 'ring-1 ring-red-500/25' : avgMarginEmphasis === 'warning' ? 'ring-1 ring-amber-500/25' : '')}>
                  <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Average margin</p>
                  <p className={cn('mt-2 text-3xl font-semibold tabular-nums', avgMarginEmphasis === 'danger' ? 'text-red-500' : avgMarginEmphasis === 'warning' ? 'text-amber-500' : 'text-text-primary')}>
                    {formatPercentValue(avgMargin)}
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-bg-input overflow-hidden">
                    <div
                      className={cn(avgMarginEmphasis === 'danger' ? 'bg-red-500/70' : avgMarginEmphasis === 'warning' ? 'bg-amber-500/70' : 'bg-emerald-500/60')}
                      style={{ width: `${Math.max(0, Math.min(100, avgMargin ?? 0))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-text-tertiary">
                    Warning at {marginWarning}% / Critical at {marginCritical}%
                  </p>
                </Card>
              )}

              {isItemEnabled('profit_worst_jobs') && (
                <Card>
                  <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Worst margin jobs</p>
                  <div className="mt-3 space-y-2">
                    {(profitability?.worstJobs ?? []).length === 0 ? (
                      <p className="text-sm text-text-secondary">No margin data yet.</p>
                    ) : (
                      profitability?.worstJobs.map((row) => {
                        const pct = Math.max(0, Math.min(100, row.marginPercent ?? 0));
                        return (
                          <div key={row.jobId} className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-text-primary truncate">{row.title}</p>
                              <p className="text-xs text-text-tertiary">{formatPercentValue(row.marginPercent)}</p>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-bg-input overflow-hidden">
                              <div className="h-full bg-red-500/60" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              )}

              {isItemEnabled('profit_best_job_types') && (
                <Card>
                  <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Best job types</p>
                  <div className="mt-3 space-y-2">
                    {(profitability?.bestJobTypes ?? []).length === 0 ? (
                      <p className="text-sm text-text-secondary">No job type data yet.</p>
                    ) : (
                      profitability?.bestJobTypes.map((row) => {
                        const pct = Math.max(0, Math.min(100, row.averageMarginPercent ?? 0));
                        return (
                          <div key={row.jobTypeId} className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-text-primary truncate">{row.label}</p>
                              <p className="text-xs text-text-tertiary">{formatPercentValue(row.averageMarginPercent)}</p>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-bg-input overflow-hidden">
                              <div className="h-full bg-emerald-500/60" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="mt-1 text-[11px] text-text-tertiary">{row.jobCount} job(s)</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              )}
            </div>
          )}

          {showProfitabilityTrend && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">Margin trend</p>
                  <p className="text-xs text-text-tertiary mt-1">Average margin per period bucket.</p>
                </div>
              </div>
              <div className="mt-4">
                {trendPoints.length === 0 ? (
                  <p className="text-sm text-text-secondary">No margin trend data yet.</p>
                ) : (
                  <div className="flex items-end gap-1 h-24">
                    {trendPoints.map((point) => (
                      <div
                        key={point.label}
                        className="flex-1 min-w-[3px] rounded-sm bg-emerald-500/40 hover:bg-emerald-500/60 transition-colors"
                        title={`${point.label}: ${formatPercentValue(point.marginPercent)}`}
                        style={{ height: `${trendMax > 0 ? Math.max(2, ((point.marginPercent ?? 0) / trendMax) * 100) : 2}%` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </section>
      )}

      {showProductivitySection && (
        <section className="space-y-4" style={{ order: getSectionOrderIndex('productivity') }}>
          <SectionHeader title="Install productivity" subtitle="Team speed and individual trends." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {isItemEnabled('productivity_team_avg') && (
              <DashboardMetricCard
                title={`Avg ${config?.kpiUnits?.productivityUnit ?? 'm2/min'} (team)`}
                value={formatRate(installTeamRate)}
                subtitle={installTeamMinutes > 0 ? '30d rolling speed' : 'No install data yet'}
              />
            )}
            {isItemEnabled('productivity_fastest') && (
              <DashboardMetricCard
                title="Fastest trend"
                value={formatRate(fastest?.m2PerMinute30d ?? 0)}
                subtitle={fastestName ? fastestName : 'No install data yet'}
                delta={fastestTrend}
              />
            )}
            {isItemEnabled('productivity_slowest') && (
              <DashboardMetricCard
                title="Slowest trend"
                value={formatRate(slowest?.m2PerMinute30d ?? 0)}
                subtitle={slowestName ? slowestName : 'No install data yet'}
                delta={slowestTrend}
              />
            )}
          </div>
        </section>
      )}

      {showPeriodSection && periodMetrics && (
        <section className="space-y-4" style={{ order: getSectionOrderIndex('period') }}>
          <SectionHeader title="Period diagnostics" subtitle="Completion rates and workload balance." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {isItemEnabled('period_completion') && (
              <DashboardMetricCard title="Completion" value={`${periodMetrics.completionPct}%`} subtitle="Completed (current state)" />
            )}
            {isItemEnabled('period_avg_duration') && (
              <DashboardMetricCard title="Avg Duration" value={formatMinutes(periodMetrics.averageJobDurationMinutes)} subtitle="Average scheduled duration" />
            )}
            {isItemEnabled('period_avg_jobs_per_crew') && (
              <DashboardMetricCard title="Avg Jobs / Crew" value={String(periodMetrics.averageJobsPerCrew)} subtitle="Workload spread" />
            )}
          </div>
        </section>
      )}

      {showDetailSection && (
        <section className="space-y-4" style={{ order: getSectionOrderIndex('detail') }}>
          <SectionHeader
            title="Operations detail"
            subtitle={mode === 'today' ? 'Crew timelines and recent activity.' : 'Recent activity across work and warehouse.'}
          />
          <div className={cn('grid grid-cols-1 gap-4', detailTwoCols && 'xl:grid-cols-2')}>
            {showDetailSnapshot && (
              <DashboardTodaySnapshot crews={safeCrews} assignments={safeAssignments} activeDate={now} />
            )}
            {showDetailActivity && (
              <DashboardActivityFeed items={activity} loading={activityLoadingMode === mode || activity === null} error={activityError} />
            )}
          </div>
        </section>
      )}
      </div>

      {customizeOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCustomizeOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Card className="w-full max-w-5xl max-h-[85vh] overflow-hidden border border-border-subtle bg-bg-base">
              <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
                <div>
                  <p className="text-lg font-semibold text-text-primary">Customize dashboard</p>
                  <p className="mt-1 text-xs text-text-tertiary">Choose the cards and sections you want to see.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCustomizeOpen(false)}>
                  Close
                </Button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-8">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Section order</p>
                    <p className="text-xs text-text-tertiary">Reorder the dashboard sections to fit your workflow.</p>
                  </div>
                  <div className="space-y-2">
                    {sectionOrder.map((groupId, index) => {
                      const group = DASHBOARD_GROUP_BY_ID.get(groupId);
                      if (!group) return null;
                      return (
                        <div
                          key={groupId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-section/30 px-3 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-medium text-text-primary">{group.title}</p>
                            <p className="text-xs text-text-tertiary">{group.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => moveSection(groupId, 'up')} disabled={index === 0}>
                              Move up
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveSection(groupId, 'down')}
                              disabled={index === sectionOrder.length - 1}
                            >
                              Move down
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {DASHBOARD_SELECTION_GROUPS.map((group) => (
                  <div key={group.id} className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{group.title}</p>
                      <p className="text-xs text-text-tertiary">{group.description}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {group.items.map((item) => (
                        <label
                          key={item.id}
                          className="flex items-start gap-3 rounded-md border border-border-subtle bg-bg-section/30 p-3 hover:bg-bg-section/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-amber-400"
                            checked={isItemEnabled(item.id)}
                            onChange={() => toggleItem(item.id)}
                          />
                          <div>
                            <p className="text-sm font-medium text-text-primary">{item.label}</p>
                            <p className="text-xs text-text-tertiary">{item.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
                <Button variant="secondary" size="sm" onClick={resetDefaults}>
                  Reset defaults
                </Button>
                <p className="text-xs text-text-tertiary">
                  {enabledItems.size} of {DASHBOARD_ITEMS.length} selected
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
