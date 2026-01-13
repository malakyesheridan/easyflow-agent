'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import CrewsSkeleton from '@/components/crews/CrewsSkeleton';
import CrewMemberCard from '@/components/crews/CrewMemberCard';
import type { CrewMember } from '@/db/schema/crew_members';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { computeCrewCardMetrics } from '@/lib/utils/crewMetrics';
import Card from '@/components/ui/Card';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

function decodeCrewMembers(raw: any[]): CrewMember[] {
  return raw.map((m) => ({
    ...m,
    createdAt: new Date(m.createdAt),
    updatedAt: new Date(m.updatedAt),
  }));
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

export default function CrewsView({ orgId }: { orgId: string }) {
  const [activeOnly, setActiveOnly] = useState(true);
  const [crewMembers, setCrewMembers] = useState<CrewMember[] | null>(null);
  const [assignments, setAssignments] = useState<ScheduleAssignmentWithJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);

      const [crewRes, assignmentsRes] = await Promise.all([
        fetch(`/api/crews?orgId=${orgId}&activeOnly=${activeOnly ? 'true' : 'false'}`),
        (() => {
          const end = new Date();
          end.setDate(end.getDate() + 1);
          end.setHours(0, 0, 0, 0);
          const start = new Date(end);
          start.setDate(start.getDate() - 14);
          const url = `/api/schedule-assignments?orgId=${orgId}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
          return fetch(url);
        })(),
      ]);

      const crewJson = (await crewRes.json()) as ApiResponse<any[]>;
      const assignmentsJson = (await assignmentsRes.json()) as ApiResponse<any[]>;

      if (!crewRes.ok || !crewJson.ok) {
        setCrewMembers([]);
        setError('Failed to load crew members');
      } else {
        setCrewMembers(decodeCrewMembers(crewJson.data));
      }

      if (!assignmentsRes.ok || !assignmentsJson.ok) {
        setAssignments([]);
        setError(prev => prev ?? 'Failed to load schedule assignments');
      } else {
        setAssignments(decodeAssignments(assignmentsJson.data));
      }
    } catch {
      setCrewMembers([]);
      setAssignments([]);
      setError('Failed to load crews');
    }
  }, [activeOnly, orgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const badgesByCrewId = useMemo(() => {
    if (!crewMembers || !assignments) return new Map<string, { label: string; tone: 'gold' | 'emerald' | 'amber' }>();

    const metrics = crewMembers.map((m) => ({
      id: m.id,
      m: computeCrewCardMetrics({ now, crew: m, assignments }),
    }));

    const topByCompleted = [...metrics].sort((a, b) => b.m.today.completedJobs - a.m.today.completedJobs)[0];
    const topByUtil = [...metrics].sort((a, b) => b.m.today.utilisationPct - a.m.today.utilisationPct)[0];
    const overdueRisk = metrics.find((x) => x.m.today.overdueJobs > 0);

    const map = new Map<string, { label: string; tone: 'gold' | 'emerald' | 'amber' }>();
    if (topByCompleted && topByCompleted.m.today.completedJobs > 0) map.set(topByCompleted.id, { label: 'Top performer today', tone: 'emerald' });
    if (topByUtil && topByUtil.m.today.utilisationPct >= 80) map.set(topByUtil.id, { label: 'Most utilised', tone: 'gold' });
    if (overdueRisk) map.set(overdueRisk.id, { label: 'Overdue risk', tone: 'amber' });
    return map;
  }, [assignments, crewMembers, now]);

  if (crewMembers === null || assignments === null) return <CrewsSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Chip active={activeOnly} onClick={() => setActiveOnly(true)}>
            Active
          </Chip>
          <Chip active={!activeOnly} onClick={() => setActiveOnly(false)}>
            All
          </Chip>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchAll}>
            Refresh
          </Button>
          <Link href="/crews/new">
            <Button>Add Crew Member</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {crewMembers.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary">No crew members yet.</p>
          <p className="mt-1 text-xs text-text-tertiary">Add your first crew member to start tracking activity.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {crewMembers.map((member) => (
            <CrewMemberCard
              key={member.id}
              now={now}
              member={member}
              assignments={assignments}
              badge={badgesByCrewId.get(member.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
