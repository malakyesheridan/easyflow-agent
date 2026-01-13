'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { Card, Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR, UNASSIGNED_LANE_ID } from './scheduleConstants';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';

type CrewOption = { id: string; name: string };

export default function RescheduleSheet(props: {
  isOpen: boolean;
  assignment: ScheduleAssignmentWithJob | null;
  crews: CrewOption[];
  onClose: () => void;
  onReschedule: (params: { assignmentId: string; crewId: string | null; date: string; startMinutes: number; durationMinutes: number }) => Promise<void>;
}) {
  const { isOpen, assignment, crews, onClose, onReschedule } = props;
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(onClose, isMobile);
  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const [crewId, setCrewId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationMinutes = useMemo(() => {
    if (!assignment) return 0;
    return assignment.endMinutes - assignment.startMinutes;
  }, [assignment]);

  useEffect(() => {
    if (!assignment) return;
    const date = assignment.date instanceof Date ? assignment.date : new Date(assignment.date);
    const dateStr = date.toISOString().split('T')[0];
    const totalMinutes = WORKDAY_START_HOUR * 60 + assignment.startMinutes;
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    setDateValue(dateStr);
    setTimeValue(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    setCrewId(assignment.crewId || UNASSIGNED_LANE_ID);
    setError(null);
  }, [assignment]);

  const handleSave = async () => {
    if (!assignment) return;
    if (!crewId || !dateValue || !timeValue) {
      setError('Select a crew (or unassigned), date, and time.');
      return;
    }

    const [hStr, mStr] = timeValue.split(':');
    const hours = Number(hStr);
    const minutes = Number(mStr);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      setError('Enter a valid time.');
      return;
    }
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = totalMinutes - WORKDAY_START_HOUR * 60;
    const maxMinutes = (WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60;
    if (startMinutes < 0 || startMinutes + durationMinutes > maxMinutes) {
      setError('Time must be within the workday.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onReschedule({
        assignmentId: assignment.id,
        crewId: crewId === UNASSIGNED_LANE_ID ? null : crewId,
        date: dateValue,
        startMinutes,
        durationMinutes,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reschedule');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !assignment) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-6">
        <Card
          padding="none"
          className={cn(
            'w-full bg-bg-base border border-border-subtle',
            'md:max-w-md md:rounded-lg',
            isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'max-h-[80vh] overflow-y-auto'
          )}
          onClick={(e) => e.stopPropagation()}
          {...swipe}
        >
          <div className="p-4 md:p-6 space-y-4">
            {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Reschedule</h3>
                <p className="text-xs text-text-tertiary mt-1">{assignment.job?.title}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                Close
              </Button>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Select label="Crew" value={crewId} onChange={(e) => setCrewId(e.target.value)} disabled={saving}>
              <option value="">Select a crew...</option>
              <option value={UNASSIGNED_LANE_ID}>Unassigned</option>
              {crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-1 gap-3">
              <Input
                label="Date"
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                disabled={saving}
              />
              <Input
                label="Start time"
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="text-xs text-text-tertiary">
              Duration: {Math.round(durationMinutes)} minutes
            </div>

            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Update schedule'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
