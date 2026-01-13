'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

type CrewRole = 'installer' | 'supervisor' | 'apprentice' | 'warehouse' | 'admin';

const ROLE_OPTIONS: Array<{ value: CrewRole; label: string }> = [
  { value: 'installer', label: 'Installer' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'apprentice', label: 'Apprentice' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'admin', label: 'Admin' },
];

function minutesFromHHMM(value: string): number | null {
  const m = value.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export default function CrewMemberCreateForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<CrewRole>('installer');
  const [active, setActive] = useState(true);
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('18:00');
  const [dailyCapacityMinutes, setDailyCapacityMinutes] = useState(480);
  const [costRateType, setCostRateType] = useState<'hourly' | 'daily'>('hourly');
  const [costRate, setCostRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return firstName.trim().length > 0 && lastName.trim().length > 0 && !submitting;
  }, [firstName, lastName, submitting]);

  const onSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    const startMinutes = minutesFromHHMM(startTime);
    const endMinutes = minutesFromHHMM(endTime);
    if (startMinutes === null || endMinutes === null) {
      setSubmitting(false);
      setError('Enter default hours as HH:MM (e.g. 06:00).');
      return;
    }

    const costRateValue = costRate.trim() ? Number(costRate) : null;
    if (costRateValue !== null && (!Number.isFinite(costRateValue) || costRateValue < 0)) {
      setSubmitting(false);
      setError('Enter a valid cost rate (e.g. 45.00).');
      return;
    }

    try {
      const res = await fetch('/api/crews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          firstName,
          lastName,
          role,
          active,
          defaultStartMinutes: startMinutes,
          defaultEndMinutes: endMinutes,
          dailyCapacityMinutes,
          costRateType,
          costRateCents: costRateValue === null ? null : Math.round(costRateValue * 100),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error?.message || 'Failed to create crew member');
        return;
      }

      router.push(`/crews/${json.data.id}`);
      router.refresh();
    } catch (e) {
      console.error(e);
      setError('Network error: failed to create crew member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Crew member details</h2>
          <p className="mt-1 text-sm text-text-secondary">
            This person becomes schedulable immediately (once schedule is wired to crew members).
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <Select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as CrewRole)}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <div className="flex items-end gap-3 rounded-md border border-border-subtle bg-bg-section/30 px-4 py-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Default start" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="Default end" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <Input
            label="Daily capacity (min)"
            type="number"
            value={String(dailyCapacityMinutes)}
            onChange={(e) => setDailyCapacityMinutes(Number(e.target.value))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Cost rate type" value={costRateType} onChange={(e) => setCostRateType(e.target.value as 'hourly' | 'daily')}>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
          </Select>
          <Input
            label={`Cost rate (${costRateType === 'daily' ? 'per day' : 'per hour'})`}
            inputMode="decimal"
            placeholder="e.g. 45.00"
            value={costRate}
            onChange={(e) => setCostRate(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit}>
            {submitting ? 'Creating…' : 'Create crew member'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
