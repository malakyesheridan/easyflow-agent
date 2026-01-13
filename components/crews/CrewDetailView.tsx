'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import CrewMiniTimeline from '@/components/crews/CrewMiniTimeline';
import type { CrewMember } from '@/db/schema/crew_members';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { computeCrewCardMetrics, getCrewDisplayName, getInitials } from '@/lib/utils/crewMetrics';
import { buildOrgDayKeySet } from '@/lib/utils/dashboardMetrics';
import { getOrgDayKey } from '@/lib/utils/scheduleDayOwnership';
import { hasSchedulableAddress, buildFullAddress } from '@/lib/utils/jobAddress';
import { preResolveTravelDurations, getAssignmentPairCacheKey, type TravelPair } from '@/lib/utils/scheduleTimeline';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type CrewInstallStats = {
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

type LeaderboardMetricKey =
  | 'nir'
  | 'str'
  | 'cir'
  | 'ca_nir'
  | 'qa_nir'
  | 'cqa_nir'
  | 'waiting_pct'
  | 'rework_pct';

type LeaderboardResponse = {
  metric: {
    key: LeaderboardMetricKey;
    label: string;
    abbreviation: string;
    unit: 'rate' | 'percent';
  };
  windows: {
    days7: { average: number; jobs: Array<{ id: string; name: string; value: number }>; employees?: Array<{ id: string; name: string; value: number }> };
    days30: { average: number; jobs: Array<{ id: string; name: string; value: number }>; employees?: Array<{ id: string; name: string; value: number }> };
    days90: { average: number; jobs: Array<{ id: string; name: string; value: number }>; employees?: Array<{ id: string; name: string; value: number }> };
  };
};

function decodeCrewMember(raw: any): CrewMember {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

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

function decodeInstallStats(raw: any): CrewInstallStats | null {
  if (!raw) return null;
  const toNum = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    m2Total7d: toNum(raw.m2Total7d),
    minutesTotal7d: toNum(raw.minutesTotal7d),
    m2PerMinute7d: toNum(raw.m2PerMinute7d),
    m2Total30d: toNum(raw.m2Total30d),
    minutesTotal30d: toNum(raw.minutesTotal30d),
    m2PerMinute30d: toNum(raw.m2PerMinute30d),
    m2Total90d: toNum(raw.m2Total90d),
    minutesTotal90d: toNum(raw.minutesTotal90d),
    m2PerMinute90d: toNum(raw.m2PerMinute90d),
    computedAt: raw.computedAt ? new Date(raw.computedAt) : new Date(),
  };
}

function formatRole(role: CrewMember['role']): string {
  const map: Record<string, string> = {
    installer: 'Installer',
    supervisor: 'Supervisor',
    apprentice: 'Apprentice',
    warehouse: 'Warehouse',
    admin: 'Admin',
  };
  return map[role] || role;
}

function formatTimeFromMinutes(minutesFromMidnight: number): string {
  const hh = Math.floor(minutesFromMidnight / 60);
  const mm = minutesFromMidnight % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '--';
  return rate.toFixed(3).replace(/\.?0+$/, '');
}

function formatM2(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return value.toFixed(1).replace(/\.0$/, '');
}

function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatMetricValue(unit: 'rate' | 'percent', value: number): string {
  return unit === 'percent' ? formatPercentValue(value) : formatRate(value);
}

function formatCostRate(member: CrewMember | null): string {
  if (!member || !Number.isFinite(member.costRateCents ?? NaN)) return '--';
  const label = member.costRateType === 'daily' ? 'day' : 'hour';
  return `AUD ${(Number(member.costRateCents) / 100).toFixed(2)} per ${label}`;
}

export default function CrewDetailView({ orgId, crewId }: { orgId: string; crewId: string }) {
  const router = useRouter();
  const [member, setMember] = useState<CrewMember | null>(null);
  const [assignments, setAssignments] = useState<ScheduleAssignmentWithJob[] | null>(null);
  const [installStats, setInstallStats] = useState<CrewInstallStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedTravelDurations, setResolvedTravelDurations] = useState<Map<string, number>>(new Map());
  const [activeFilter, setActiveFilter] = useState<'today' | 'week' | 'month'>('today');
  const [costRateType, setCostRateType] = useState<'hourly' | 'daily'>('hourly');
  const [costRate, setCostRate] = useState('');
  const [costRateSaving, setCostRateSaving] = useState(false);
  const [costRateError, setCostRateError] = useState<string | null>(null);
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetricKey>('nir');
  const [leaderboardWindow, setLeaderboardWindow] = useState<'days7' | 'days30' | 'days90'>('days30');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [memberRes, assignmentsRes, statsRes] = await Promise.all([
        fetch(`/api/crews/${crewId}?orgId=${orgId}`),
        (() => {
          const end = new Date();
          end.setDate(end.getDate() + 1);
          end.setHours(0, 0, 0, 0);
          const start = new Date(end);
          start.setDate(start.getDate() - 60);
          const url = `/api/schedule-assignments?orgId=${orgId}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
          return fetch(url);
        })(),
        fetch(`/api/crew-install-stats?orgId=${orgId}&crewMemberId=${crewId}&recompute=true`),
      ]);

      const memberJson = (await memberRes.json()) as ApiResponse<any>;
      const assignmentsJson = (await assignmentsRes.json()) as ApiResponse<any[]>;
      const statsJson = (await statsRes.json()) as ApiResponse<any>;

      if (!memberRes.ok || !memberJson.ok) {
        setMember(null);
        const message =
          !memberRes.ok
            ? 'Failed to load crew member'
            : !memberJson.ok && 'error' in memberJson
              ? memberJson.error?.message || 'Failed to load crew member'
              : 'Failed to load crew member';
        setError(message);
      } else {
        setMember(decodeCrewMember(memberJson.data));
      }

      if (!assignmentsRes.ok || !assignmentsJson.ok) {
        setAssignments([]);
        setError(prev => prev ?? 'Failed to load assignments');
      } else {
        setAssignments(decodeAssignments(assignmentsJson.data));
      }

      if (!statsRes.ok || !statsJson.ok) {
        setInstallStats(null);
      } else {
        setInstallStats(decodeInstallStats(statsJson.data));
      }
    } catch {
      setMember(null);
      setAssignments([]);
      setInstallStats(null);
      setError('Failed to load crew detail');
    }
  }, [crewId, orgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!member) return;
    setCostRateType(member.costRateType === 'daily' ? 'daily' : 'hourly');
    setCostRate(Number.isFinite(member.costRateCents ?? NaN) ? ((member.costRateCents ?? 0) / 100).toFixed(2) : '');
  }, [member]);

  useEffect(() => {
    let active = true;
    const loadLeaderboard = async () => {
      setLeaderboardLoading(true);
      setLeaderboardError(null);
      try {
        const res = await fetch(`/api/install-productivity/leaderboard?orgId=${orgId}&metric=${leaderboardMetric}`);
        const json = (await res.json()) as ApiResponse<LeaderboardResponse>;
        const message = !json.ok && 'error' in json ? json.error?.message : undefined;
        if (!res.ok || !json.ok) throw new Error(message || 'Failed to load leaderboard');
        if (active) setLeaderboardData(json.data);
      } catch (err) {
        if (active) setLeaderboardError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      } finally {
        if (active) setLeaderboardLoading(false);
      }
    };
    void loadLeaderboard();
    return () => {
      active = false;
    };
  }, [leaderboardMetric, orgId]);

  const todaysAssignments = useMemo(() => {
    if (!assignments) return [];
    const todayKey = getOrgDayKey(now);
    return assignments
      .filter(a => a.crewId === crewId && getOrgDayKey(a.date) === todayKey)
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [assignments, crewId, now]);

  useEffect(() => {
    if (todaysAssignments.length < 2 || !member) return;
    const dateStr = getOrgDayKey(now);
    const pairs: TravelPair[] = [];
    for (let i = 0; i < todaysAssignments.length - 1; i++) {
      const from = todaysAssignments[i];
      const to = todaysAssignments[i + 1];
      if (!from.job || !to.job) continue;
      if (!hasSchedulableAddress(from.job) || !hasSchedulableAddress(to.job)) continue;
      const origin = buildFullAddress(from.job);
      const destination = buildFullAddress(to.job);
      if (!origin || !destination) continue;
      pairs.push({
        cacheKey: getAssignmentPairCacheKey(crewId, dateStr, from.id, to.id),
        crewId,
        date: dateStr,
        fromAssignmentId: from.id,
        toAssignmentId: to.id,
        originAddress: origin,
        destinationAddress: destination,
      });
    }

    if (pairs.length === 0) return;
    preResolveTravelDurations(pairs)
      .then(setResolvedTravelDurations)
      .catch(() => setResolvedTravelDurations(new Map()));
  }, [crewId, member, now, todaysAssignments]);

  const currentAndNext = useMemo(() => {
    const t = now.getTime();
    const current = todaysAssignments.find(a => {
      if (a.status === 'completed') return false;
      return t >= new Date(a.scheduledStart).getTime() && t <= new Date(a.scheduledEnd).getTime();
    }) ?? null;
    const next = todaysAssignments.find(a => new Date(a.scheduledStart).getTime() > t) ?? null;
    return { current, next };
  }, [now, todaysAssignments]);

  const periodAssignments = useMemo(() => {
    if (!assignments) return [];
    const days = activeFilter === 'week' ? 7 : activeFilter === 'month' ? 30 : 1;
    const keys = buildOrgDayKeySet(now, days);
    return assignments.filter(a => a.crewId === crewId && keys.has(getOrgDayKey(a.date)));
  }, [activeFilter, assignments, crewId, now]);

  const summary = useMemo(() => {
    if (!member || !assignments) return null;
    return computeCrewCardMetrics({ now, crew: member, assignments });
  }, [assignments, member, now]);

  const leaderboardWindowData = leaderboardData?.windows?.[leaderboardWindow] ?? null;
  const leaderboardUnit = leaderboardData?.metric.unit ?? 'rate';
  const leaderboardMetricOptions: Array<{ key: LeaderboardMetricKey; label: string }> = [
    { key: 'nir', label: 'Net Install Rate (NIR)' },
    { key: 'str', label: 'Site Throughput Rate (STR)' },
    { key: 'cir', label: 'Crew Install Rate (CIR)' },
    { key: 'ca_nir', label: 'Complexity Adjusted NIR (CA-NIR)' },
    { key: 'qa_nir', label: 'Quality Adjusted NIR (QA-NIR)' },
    { key: 'cqa_nir', label: 'Complexity + Quality Adjusted NIR (CQA-NIR)' },
    { key: 'waiting_pct', label: 'Waiting Time Share' },
    { key: 'rework_pct', label: 'Rework Time Share' },
  ];

  const onToggleActive = useCallback(async () => {
    if (!member) return;
    const nextActive = !member.active;
    try {
      const res = await fetch('/api/crews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, orgId, active: nextActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error?.message || 'Failed to update crew member');
        return;
      }
      setMember(decodeCrewMember(json.data));
      router.refresh();
    } catch {
      setError('Network error: failed to update crew member');
    }
  }, [member, orgId, router]);

  const saveCostRate = useCallback(async () => {
    if (!member) return;
    const parsed = costRate.trim() ? Number(costRate) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setCostRateError('Enter a valid cost rate.');
      return;
    }
    setCostRateSaving(true);
    setCostRateError(null);
    try {
      const res = await fetch('/api/crews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: member.id,
          orgId,
          costRateType,
          costRateCents: parsed === null ? null : Math.round(parsed * 100),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setCostRateError(json?.error?.message || 'Failed to update cost rate');
        return;
      }
      setMember(decodeCrewMember(json.data));
      router.refresh();
    } catch {
      setCostRateError('Network error: failed to update cost rate');
    } finally {
      setCostRateSaving(false);
    }
  }, [costRate, costRateType, member, orgId, router]);

  if (member === null || assignments === null) {
    return (
      <Card className="animate-pulse">
        <div className="h-6 w-48 rounded bg-bg-section/80" />
        <div className="mt-3 h-4 w-64 rounded bg-bg-section/80" />
        <div className="mt-6 h-24 rounded bg-bg-section/80" />
      </Card>
    );
  }

  if (!member) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">Crew member not found.</p>
        <div className="mt-4">
          <Link href="/crews" className="text-sm font-medium text-accent-gold hover:text-accent-gold/80">
            Back to crews
          </Link>
        </div>
      </Card>
    );
  }

  const name = getCrewDisplayName(member);
  const initials = getInitials(name);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-full bg-bg-section/60 ring-1 ring-border-subtle flex items-center justify-center font-semibold text-text-primary">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{name}</h1>
            <p className="text-sm text-text-secondary">{formatRole(member.role)} · {member.active ? 'Active' : 'Inactive'}</p>
            <p className="mt-1 text-xs text-text-tertiary">
              Default hours {formatTimeFromMinutes(member.defaultStartMinutes)}–{formatTimeFromMinutes(member.defaultEndMinutes)} · Capacity {member.dailyCapacityMinutes}m/day
            </p>
            <p className="mt-1 text-xs text-text-tertiary">Cost rate: {formatCostRate(member)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchAll}>Refresh</Button>
          <Button variant="secondary" onClick={onToggleActive}>{member.active ? 'Deactivate' : 'Activate'}</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Labour cost rate</h2>
            <p className="mt-1 text-xs text-text-tertiary">Used for job profitability (internal cost only).</p>
          </div>
          <Button variant="secondary" onClick={saveCostRate} disabled={costRateSaving}>
            {costRateSaving ? 'Saving...' : 'Save rate'}
          </Button>
        </div>
        {costRateError && (
          <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {costRateError}
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            label="Rate type"
            value={costRateType}
            onChange={(e) => setCostRateType(e.target.value as 'hourly' | 'daily')}
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
          </Select>
          <Input
            label={`Cost rate (${costRateType === 'daily' ? 'per day' : 'per hour'})`}
            inputMode="decimal"
            value={costRate}
            onChange={(e) => setCostRate(e.target.value)}
            placeholder="e.g. 45.00"
          />
        </div>
      </Card>

      {summary && (
        <Card className="md:hidden">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text-primary">Crew snapshot</p>
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-md bg-bg-section/40 p-3">
                <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Today&apos;s jobs</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{summary.today.scheduledJobs}</p>
              </div>
              <div className="rounded-md bg-bg-section/40 p-3">
                <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Week workload</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{summary.week.utilisationPct}%</p>
              </div>
              <div className="rounded-md bg-bg-section/40 p-3">
                <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Performance</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{summary.week.completedJobs} completed</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Overview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-text-primary">Today snapshot</h2>
          <p className="mt-1 text-xs text-text-tertiary">Schedule, gaps, and travel buffers for today.</p>
          <div className="mt-4">
            {todaysAssignments.length === 0 ? (
              <p className="text-sm text-text-secondary">No jobs scheduled today.</p>
            ) : (
              <CrewMiniTimeline assignments={todaysAssignments} resolvedTravelDurations={resolvedTravelDurations} />
            )}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-text-tertiary">
            <span>Assigned today: {todaysAssignments.length}</span>
            <Link href={`/schedule?highlightCrewId=${crewId}`} className="font-semibold text-accent-gold hover:text-accent-gold/80">
              Open full schedule
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-text-primary">Now / Next</h2>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Current job</p>
              <p className="mt-1 text-sm text-text-secondary">
                {currentAndNext.current ? currentAndNext.current.job.title : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Next job</p>
              <p className="mt-1 text-sm text-text-secondary">
                {currentAndNext.next ? currentAndNext.next.job.title : '—'}
              </p>
            </div>
            {summary && (
              <div className="pt-3 border-t border-border-subtle">
                <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Overdue risk</p>
                <p className={summary.today.overdueJobs > 0 ? 'mt-1 text-sm font-semibold text-amber-400' : 'mt-1 text-sm text-text-secondary'}>
                  {summary.today.overdueJobs}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Performance */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Performance</h2>
            <p className="mt-1 text-xs text-text-tertiary">Signal over time based on schedule activity.</p>
          </div>
          <div className="flex items-center gap-2">
            <Chip active={activeFilter === 'today'} onClick={() => setActiveFilter('today')}>Today</Chip>
            <Chip active={activeFilter === 'week'} onClick={() => setActiveFilter('week')}>Week</Chip>
            <Chip active={activeFilter === 'month'} onClick={() => setActiveFilter('month')}>Month</Chip>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md bg-bg-section/30 p-4">
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Jobs scheduled</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
              {new Set(periodAssignments.map(a => a.jobId)).size}
            </p>
          </div>
          <div className="rounded-md bg-bg-section/30 p-4">
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Jobs completed</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
              {new Set(periodAssignments.filter(a => a.status === 'completed').map(a => a.jobId)).size}
            </p>
          </div>
          <div className="rounded-md bg-bg-section/30 p-4">
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Avg duration</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
              {periodAssignments.length === 0
                ? '—'
                : `${Math.round(periodAssignments.reduce((s, a) => s + (a.endMinutes - a.startMinutes), 0) / periodAssignments.length)}m`}
            </p>
          </div>
          <div className="rounded-md bg-bg-section/30 p-4">
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Utilisation (approx.)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
              {periodAssignments.length === 0
                ? '—'
                : `${Math.min(100, Math.round((periodAssignments.reduce((s, a) => s + (a.endMinutes - a.startMinutes), 0) / Math.max(1, member.dailyCapacityMinutes * (activeFilter === 'today' ? 1 : activeFilter === 'week' ? 5 : 20))) * 100))}%`}
            </p>
          </div>
        </div>
      </Card>

      {/* Install speed */}
      <Card>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Install speed</h2>
          <p className="mt-1 text-xs text-text-tertiary">Derived from accepted m2 and install-minute attribution.</p>
        </div>

        {!installStats ? (
          <p className="mt-4 text-sm text-text-secondary">No install history yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-md bg-bg-section/30 p-4">
              <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">7d avg m2/min</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
                {formatRate(installStats.m2PerMinute7d)}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {formatM2(installStats.m2Total7d)} m2 • {Math.round(installStats.minutesTotal7d)} min
              </p>
            </div>
            <div className="rounded-md bg-bg-section/30 p-4">
              <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">30d avg m2/min</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
                {formatRate(installStats.m2PerMinute30d)}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {formatM2(installStats.m2Total30d)} m2 • {Math.round(installStats.minutesTotal30d)} min
              </p>
            </div>
            <div className="rounded-md bg-bg-section/30 p-4">
              <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">90d avg m2/min</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
                {formatRate(installStats.m2PerMinute90d)}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {formatM2(installStats.m2Total90d)} m2 • {Math.round(installStats.minutesTotal90d)} min
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Productivity leaderboard</h2>
            <p className="mt-1 text-xs text-text-tertiary">Compare crew and job metrics across recent windows.</p>
          </div>
          <Select
            label="Metric"
            value={leaderboardMetric}
            onChange={(e) => setLeaderboardMetric(e.target.value as LeaderboardMetricKey)}
          >
            {leaderboardMetricOptions.map((metric) => (
              <option key={metric.key} value={metric.key}>
                {metric.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Chip active={leaderboardWindow === 'days7'} onClick={() => setLeaderboardWindow('days7')}>
            7d
          </Chip>
          <Chip active={leaderboardWindow === 'days30'} onClick={() => setLeaderboardWindow('days30')}>
            30d
          </Chip>
          <Chip active={leaderboardWindow === 'days90'} onClick={() => setLeaderboardWindow('days90')}>
            90d
          </Chip>
        </div>

        {leaderboardError && (
          <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {leaderboardError}
          </div>
        )}

        <div className="mt-4 rounded-md border border-border-subtle bg-bg-section/30 p-3">
          <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">
            Company average ({leaderboardWindow.replace('days', '')}d)
          </p>
          <p className="mt-1 text-lg font-semibold text-text-primary">
            {formatMetricValue(leaderboardUnit, leaderboardWindowData?.average ?? 0)}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Top crew</p>
            {leaderboardLoading ? (
              <p className="text-sm text-text-secondary mt-2">Loading leaderboard...</p>
            ) : leaderboardWindowData?.employees?.length ? (
              <div className="mt-3 space-y-2">
                {leaderboardWindowData.employees.map((row, index) => (
                  <div key={row.id} className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{index + 1}. {row.name}</span>
                    <span className="font-semibold text-text-primary">
                      {formatMetricValue(leaderboardUnit, row.value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary mt-2">No crew leaderboard for this metric.</p>
            )}
          </div>

          <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Top jobs</p>
            {leaderboardLoading ? (
              <p className="text-sm text-text-secondary mt-2">Loading leaderboard...</p>
            ) : leaderboardWindowData?.jobs?.length ? (
              <div className="mt-3 space-y-2">
                {leaderboardWindowData.jobs.map((row, index) => (
                  <div key={row.id} className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{index + 1}. {row.name}</span>
                    <span className="font-semibold text-text-primary">
                      {formatMetricValue(leaderboardUnit, row.value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary mt-2">No job leaderboard yet.</p>
            )}
          </div>
        </div>
      </Card>

      {/* Activity */}
      <Card>
        <h2 className="text-sm font-semibold text-text-primary">Activity</h2>
        <p className="mt-1 text-xs text-text-tertiary">Feed is derived from schedule + job updates (more events coming soon).</p>
        <div className="mt-4 space-y-2">
          {todaysAssignments.slice(0, 5).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md bg-bg-section/30 px-3 py-2">
              <span className="text-sm text-text-secondary truncate">{a.job.title}</span>
              <span className="text-xs text-text-tertiary">{a.status.replace('_', ' ')}</span>
            </div>
          ))}
          {todaysAssignments.length === 0 && (
            <p className="text-sm text-text-secondary">No activity yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
