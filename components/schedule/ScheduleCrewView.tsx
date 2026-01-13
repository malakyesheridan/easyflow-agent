'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import type { Job } from '@/db/schema/jobs';
import { Card, Button } from '@/components/ui';
import ScheduleMobileList from '@/components/schedule/ScheduleMobileList';
import JobDetailDrawer from '@/components/schedule/JobDetailDrawer';
import { getOrgDayKey, normalizeAssignmentForOrgDay, toOrgStartOfDay } from '@/lib/utils/scheduleDayOwnership';

export default function ScheduleCrewView({
  assignments,
  orgId,
  crewMembers,
}: {
  assignments: ScheduleAssignmentWithJob[];
  orgId: string;
  crewMembers?: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    role?: string;
    active?: boolean;
  }>;
}) {
  const router = useRouter();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeDate, setActiveDate] = useState<Date>(() => toOrgStartOfDay(new Date()));

  const normalizedAssignments = useMemo(
    () => assignments.map(normalizeAssignmentForOrgDay),
    [assignments]
  );
  const activeDateKey = useMemo(() => getOrgDayKey(activeDate), [activeDate]);
  const activeDateAssignments = useMemo(
    () => normalizedAssignments.filter((assignment) => getOrgDayKey(assignment.date) === activeDateKey),
    [activeDateKey, normalizedAssignments]
  );
  const crewOptions = useMemo(
    () =>
      (crewMembers ?? []).map((member) => {
        const displayName = (member.displayName || '').trim();
        const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
        const name = (displayName || fullName || `Crew ${String(member.id).slice(0, 8)}`).trim();
        return { id: String(member.id), name };
      }),
    [crewMembers]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
        <p className="text-sm font-semibold text-text-primary">
          {activeDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const prevDay = new Date(activeDate);
              prevDay.setDate(prevDay.getDate() - 1);
              setActiveDate(prevDay);
            }}
          >
            Prev
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setActiveDate(toOrgStartOfDay(new Date()))}>
            Today
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const nextDay = new Date(activeDate);
              nextDay.setDate(nextDay.getDate() + 1);
              setActiveDate(nextDay);
            }}
          >
            Next
          </Button>
        </div>
      </div>

      {activeDateAssignments.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary">No jobs scheduled for this day.</p>
        </Card>
      ) : (
        <ScheduleMobileList assignments={activeDateAssignments} onJobClick={setSelectedJob} />
      )}

      <JobDetailDrawer
        job={selectedJob}
        orgId={orgId}
        onClose={() => setSelectedJob(null)}
        onJobUpdate={() => router.refresh()}
        assignments={normalizedAssignments}
        crewOptions={crewOptions}
        scheduleContextDate={activeDate}
        showQuickActions={false}
      />
    </div>
  );
}
