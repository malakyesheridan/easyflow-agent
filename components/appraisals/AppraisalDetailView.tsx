'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, GlassCard, Input, Select, Textarea } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import ScoreBreakdownTooltip from '@/components/ui/ScoreBreakdownTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';

const STAGES = [
  { value: 'booked', label: 'Booked' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'prepped', label: 'Prepped' },
  { value: 'attended', label: 'Attended' },
  { value: 'followup_sent', label: 'Follow-up Sent' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const STAGE_DESCRIPTIONS: Record<string, string> = {
  booked: 'Appointment booked with the vendor.',
  confirmed: 'Appointment confirmed with decision makers.',
  prepped: 'Prep tasks in progress or completed.',
  attended: 'Appraisal meeting completed.',
  followup_sent: 'Follow-up plan or update sent.',
  won: 'Listing secured.',
  lost: 'Listing lost or delayed.',
};

const MEETING_TYPES = [
  { value: 'in_person', label: 'In person' },
  { value: 'phone', label: 'Phone' },
  { value: 'video', label: 'Video' },
];

const TIMELINES = [
  { value: 'asap', label: 'ASAP' },
  { value: 'days_30', label: '30 days' },
  { value: 'days_60_90', label: '60-90 days' },
  { value: 'unsure', label: 'Unsure' },
];

const OUTCOME_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const LOST_REASONS = [
  { value: 'commission', label: 'Commission' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'connection', label: 'Connection' },
  { value: 'price_promise', label: 'Price promise' },
  { value: 'other', label: 'Other' },
];

type Owner = { id: string; name: string | null; email: string | null };

type Appraisal = {
  id: string;
  contact: {
    id: string;
    name: string;
    suburb: string | null;
    email: string | null;
    phone: string | null;
  };
  stage: string;
  appointmentAt: string | null;
  meetingType: string;
  address: string | null;
  suburb: string | null;
  notes: string | null;
  motivation: string | null;
  timeline: string | null;
  priceExpectationMin: number | null;
  priceExpectationMax: number | null;
  decisionMakersPresent: boolean;
  objections: string[] | string | null;
  outcomeStatus: string;
  lostReason: string | null;
  lostNotes: string | null;
  expectedListDate: string | null;
  expectedPriceGuideMin: number | null;
  expectedPriceGuideMax: number | null;
  winProbabilityScore: number;
  winProbabilityReasons: string[];
  attendedAt: string | null;
  owner: Owner | null;
};

type ChecklistItem = {
  id: string;
  title: string;
  isDone: boolean;
  dueAt: string | null;
  assignedToUserId: string | null;
  sortOrder: number;
};

type Followup = {
  id: string;
  type: string;
  title: string;
  dueAt: string | null;
  isDone: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toDateTimeInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toDateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function getBand(score: number) {
  if (score >= 75) return { label: 'Hot', variant: 'gold' as const };
  if (score >= 45) return { label: 'Warm', variant: 'default' as const };
  return { label: 'Cold', variant: 'muted' as const };
}

export default function AppraisalDetailView({ appraisalId }: { appraisalId: string }) {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [appraisal, setAppraisal] = useState<Appraisal | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newChecklistDue, setNewChecklistDue] = useState('');

  const [draft, setDraft] = useState({
    stage: 'booked',
    appointmentAt: '',
    meetingType: 'in_person',
    address: '',
    suburb: '',
    notes: '',
    motivation: '',
    timeline: '',
    priceExpectationMin: '',
    priceExpectationMax: '',
    decisionMakersPresent: false,
    objections: '',
    outcomeStatus: 'pending',
    lostReason: '',
    lostNotes: '',
    expectedListDate: '',
    expectedPriceGuideMin: '',
    expectedPriceGuideMax: '',
    attendedAt: '',
    ownerUserId: '',
  });

  const band = useMemo(() => getBand(appraisal?.winProbabilityScore ?? 0), [appraisal?.winProbabilityScore]);

  useEffect(() => {
    if (!orgId || !appraisalId) return;
    let cancelled = false;

    const loadOwners = async () => {
      try {
        const res = await fetch(`/api/contacts/owners?orgId=${orgId}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load owners');
        if (!cancelled) setOwners(json.data ?? []);
      } catch {
        if (!cancelled) setOwners([]);
      }
    };

    void loadOwners();
    return () => {
      cancelled = true;
    };
  }, [orgId, appraisalId]);

  const loadAppraisal = useCallback(async () => {
    if (!orgId || !appraisalId) return;
    const res = await fetch(`/api/appraisals/${appraisalId}?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load appraisal');
    setAppraisal(json.data as Appraisal);
  }, [orgId, appraisalId]);

  const loadChecklist = useCallback(async () => {
    if (!orgId || !appraisalId) return;
    const res = await fetch(`/api/appraisals/${appraisalId}/checklist-items?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load checklist');
    setChecklist(json.data as ChecklistItem[]);
  }, [orgId, appraisalId]);

  const loadFollowups = useCallback(async () => {
    if (!orgId || !appraisalId) return;
    const res = await fetch(`/api/appraisals/${appraisalId}/followups?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load follow-ups');
    setFollowups(json.data as Followup[]);
  }, [orgId, appraisalId]);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([loadAppraisal(), loadChecklist(), loadFollowups()]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load appraisal');
    } finally {
      setLoading(false);
    }
  }, [loadAppraisal, loadChecklist, loadFollowups]);

  useEffect(() => {
    if (!orgId || !appraisalId) return;
    void refreshAll();
  }, [orgId, appraisalId, refreshAll]);

  useEffect(() => {
    if (!appraisal) return;
    setDraft({
      stage: appraisal.stage,
      appointmentAt: toDateTimeInput(appraisal.appointmentAt),
      meetingType: appraisal.meetingType,
      address: appraisal.address ?? '',
      suburb: appraisal.suburb ?? '',
      notes: appraisal.notes ?? '',
      motivation: appraisal.motivation ?? '',
      timeline: appraisal.timeline ?? '',
      priceExpectationMin: appraisal.priceExpectationMin?.toString() ?? '',
      priceExpectationMax: appraisal.priceExpectationMax?.toString() ?? '',
      decisionMakersPresent: appraisal.decisionMakersPresent,
      objections: Array.isArray(appraisal.objections)
        ? appraisal.objections.join(', ')
        : appraisal.objections ?? '',
      outcomeStatus: appraisal.outcomeStatus,
      lostReason: appraisal.lostReason ?? '',
      lostNotes: appraisal.lostNotes ?? '',
      expectedListDate: toDateInput(appraisal.expectedListDate),
      expectedPriceGuideMin: appraisal.expectedPriceGuideMin?.toString() ?? '',
      expectedPriceGuideMax: appraisal.expectedPriceGuideMax?.toString() ?? '',
      attendedAt: toDateTimeInput(appraisal.attendedAt),
      ownerUserId: appraisal.owner?.id ?? '',
    });
  }, [appraisal]);

  const saveAppraisal = async () => {
    if (!orgId || !appraisalId) return;
    setSaving(true);
    setError(null);
    const appointmentAt = draft.appointmentAt ? new Date(draft.appointmentAt) : null;
    const expectedListDate = draft.expectedListDate ? new Date(draft.expectedListDate) : null;
    const attendedAt = draft.attendedAt ? new Date(draft.attendedAt) : null;

    try {
      const res = await fetch(`/api/appraisals/${appraisalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          stage: draft.stage,
          appointmentAt: appointmentAt ? appointmentAt.toISOString() : undefined,
          meetingType: draft.meetingType,
          address: draft.address || null,
          suburb: draft.suburb || null,
          notes: draft.notes || null,
          motivation: draft.motivation || null,
          timeline: draft.timeline || null,
          priceExpectationMin: draft.priceExpectationMin ? Number(draft.priceExpectationMin) : null,
          priceExpectationMax: draft.priceExpectationMax ? Number(draft.priceExpectationMax) : null,
          decisionMakersPresent: draft.decisionMakersPresent,
          objections: draft.objections
            ? draft.objections.split(',').map((item) => item.trim()).filter(Boolean)
            : null,
          outcomeStatus: draft.outcomeStatus,
          lostReason: draft.outcomeStatus === 'lost' ? (draft.lostReason || null) : null,
          lostNotes: draft.outcomeStatus === 'lost' ? (draft.lostNotes || null) : null,
          expectedListDate: draft.outcomeStatus === 'won' && expectedListDate ? expectedListDate.toISOString() : null,
          expectedPriceGuideMin: draft.outcomeStatus === 'won' && draft.expectedPriceGuideMin ? Number(draft.expectedPriceGuideMin) : null,
          expectedPriceGuideMax: draft.outcomeStatus === 'won' && draft.expectedPriceGuideMax ? Number(draft.expectedPriceGuideMax) : null,
          attendedAt: attendedAt ? attendedAt.toISOString() : null,
          ownerUserId: draft.ownerUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update appraisal');
      setAppraisal(json.data as Appraisal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update appraisal');
    } finally {
      setSaving(false);
    }
  };

  const addChecklistItem = async () => {
    if (!orgId || !appraisalId || !newChecklistTitle.trim()) return;
    try {
      const res = await fetch(`/api/appraisals/${appraisalId}/checklist-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          title: newChecklistTitle.trim(),
          dueAt: newChecklistDue ? new Date(newChecklistDue).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to add checklist item');
      setNewChecklistTitle('');
      setNewChecklistDue('');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add checklist item');
    }
  };

  const updateChecklistItem = async (item: ChecklistItem, updates: Partial<ChecklistItem>) => {
    if (!orgId || !appraisalId) return;
    try {
      const res = await fetch(`/api/appraisals/${appraisalId}/checklist-items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          itemId: item.id,
          title: updates.title ?? item.title,
          isDone: updates.isDone ?? item.isDone,
          dueAt: updates.dueAt ? new Date(updates.dueAt).toISOString() : updates.dueAt === null ? null : item.dueAt,
          assignedToUserId: updates.assignedToUserId ?? item.assignedToUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update checklist item');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update checklist item');
    }
  };

  const deleteChecklistItem = async (itemId: string) => {
    if (!orgId || !appraisalId) return;
    try {
      const res = await fetch(`/api/appraisals/${appraisalId}/checklist-items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to delete checklist item');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete checklist item');
    }
  };

  const moveChecklistItem = async (index: number, direction: 'up' | 'down') => {
    const sorted = [...checklist].sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const updated = [...sorted];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    const reordered = updated.map((item, idx) => ({ ...item, sortOrder: idx }));
    setChecklist(reordered);

    try {
      const res = await fetch(`/api/appraisals/${appraisalId}/checklist-items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          order: reordered.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to reorder checklist');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder checklist');
    }
  };

  const createFollowupPlan = async () => {
    if (!orgId || !appraisalId) return;
    try {
      const res = await fetch(`/api/appraisals/${appraisalId}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, action: 'plan' }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to create follow-up plan');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create follow-up plan');
    }
  };

  const updateFollowup = async (followup: Followup, updates: Partial<Followup>) => {
    if (!orgId || !appraisalId) return;
    try {
      const res = await fetch(`/api/appraisals/${appraisalId}/followups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          followupId: followup.id,
          title: updates.title ?? followup.title,
          dueAt: updates.dueAt ?? followup.dueAt,
          type: updates.type ?? followup.type,
          isDone: updates.isDone ?? followup.isDone,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update follow-up');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update follow-up');
    }
  };

  if (loading) {
    return <Card>Loading appraisal...</Card>;
  }

  if (!appraisal) {
    return <Card>Appraisal not found.</Card>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <GlassCard className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/contacts/${appraisal.contact.id}`} className="text-lg font-semibold text-text-primary hover:underline">
              {appraisal.contact.name}
            </Link>
            <p className="text-xs text-text-tertiary">{appraisal.contact.suburb || 'No suburb'}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-xs uppercase tracking-[0.2em] text-text-tertiary">
              <span>Win probability</span>
              <ScoreBreakdownTooltip
                label={`Win probability details for ${appraisal.contact.name}`}
                meaning="Estimates the likelihood this appraisal converts to a signed listing."
                bullets={[
                  'Stage, prep progress, and vendor profile lift the score.',
                  'Decision makers, timeline, and expectations add confidence.',
                  'Overdue prep or lost outcomes reduce the score.',
                ]}
                reasons={appraisal.winProbabilityReasons}
                bands="Hot is 75+, Warm is 45-74, Cold is below 45."
              />
            </div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <span className="text-xl font-semibold text-text-primary">{appraisal.winProbabilityScore}%</span>
              <Badge variant={band.variant}>{band.label}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {appraisal.winProbabilityReasons.length === 0
            ? <Badge variant="muted">No score reasons yet</Badge>
            : appraisal.winProbabilityReasons.map((reason, index) => (
                <Badge key={`${appraisal.id}-reason-${index}`} variant="muted">
                  {reason}
                </Badge>
              ))}
        </div>
      </GlassCard>

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-text-primary">Appointment details</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label={(
              <span className="inline-flex items-center gap-1">
                Stage
                <InfoTooltip
                  label="Appraisal stage definitions"
                  content={(
                    <ul className="list-disc space-y-1 pl-4 text-xs text-text-secondary">
                      {STAGES.map((stage) => (
                        <li key={stage.value}>{stage.label}: {STAGE_DESCRIPTIONS[stage.value]}</li>
                      ))}
                    </ul>
                  )}
                />
              </span>
            )}
            value={draft.stage}
            onChange={(event) => setDraft((prev) => ({ ...prev, stage: event.target.value }))}
          >
            {STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </Select>
          <Input
            label="Appointment date & time"
            type="datetime-local"
            value={draft.appointmentAt}
            onChange={(event) => setDraft((prev) => ({ ...prev, appointmentAt: event.target.value }))}
          />
          <Select
            label="Meeting type"
            value={draft.meetingType}
            onChange={(event) => setDraft((prev) => ({ ...prev, meetingType: event.target.value }))}
          >
            {MEETING_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            label="Owner"
            value={draft.ownerUserId}
            onChange={(event) => setDraft((prev) => ({ ...prev, ownerUserId: event.target.value }))}
          >
            <option value="">Unassigned</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name || owner.email || owner.id}
              </option>
            ))}
          </Select>
          <Input
            label="Address"
            value={draft.address}
            onChange={(event) => setDraft((prev) => ({ ...prev, address: event.target.value }))}
          />
          <Input
            label="Suburb"
            value={draft.suburb}
            onChange={(event) => setDraft((prev) => ({ ...prev, suburb: event.target.value }))}
          />
          <Input
            label="Attended at"
            type="datetime-local"
            value={draft.attendedAt}
            onChange={(event) => setDraft((prev) => ({ ...prev, attendedAt: event.target.value }))}
          />
          <Textarea
            label="Notes"
            value={draft.notes}
            onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
            rows={3}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-text-primary">Vendor profile</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            label="Motivation"
            value={draft.motivation}
            onChange={(event) => setDraft((prev) => ({ ...prev, motivation: event.target.value }))}
          />
          <Select
            label="Timeline"
            value={draft.timeline}
            onChange={(event) => setDraft((prev) => ({ ...prev, timeline: event.target.value }))}
          >
            <option value="">Select timeline</option>
            {TIMELINES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            label="Price expectation min"
            type="number"
            value={draft.priceExpectationMin}
            onChange={(event) => setDraft((prev) => ({ ...prev, priceExpectationMin: event.target.value }))}
          />
          <Input
            label="Price expectation max"
            type="number"
            value={draft.priceExpectationMax}
            onChange={(event) => setDraft((prev) => ({ ...prev, priceExpectationMax: event.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={draft.decisionMakersPresent}
              onChange={(event) => setDraft((prev) => ({ ...prev, decisionMakersPresent: event.target.checked }))}
            />
            Decision makers present
          </label>
          <Input
            label="Objections"
            value={draft.objections}
            onChange={(event) => setDraft((prev) => ({ ...prev, objections: event.target.value }))}
            placeholder="Price, timing, marketing"
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-text-primary">Checklist</p>
        <div className="space-y-3">
          {checklist.length === 0 ? (
            <p className="text-sm text-text-secondary">No checklist items yet.</p>
          ) : (
            checklist
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item, index) => (
                <div key={item.id} className="rounded-md border border-border-subtle p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.isDone}
                      onChange={(event) => updateChecklistItem(item, { isDone: event.target.checked })}
                    />
                    <Input
                      value={item.title}
                      onChange={(event) => {
                        const next = checklist.map((row) => row.id === item.id ? { ...row, title: event.target.value } : row);
                        setChecklist(next);
                      }}
                      onBlur={(event) => updateChecklistItem(item, { title: event.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                      label="Due date"
                      type="date"
                      value={item.dueAt ? toDateInput(item.dueAt) : ''}
                      onChange={(event) => updateChecklistItem(item, { dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
                    />
                    <Select
                      label="Assigned to"
                      value={item.assignedToUserId ?? ''}
                      onChange={(event) => updateChecklistItem(item, { assignedToUserId: event.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {owners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name || owner.email || owner.id}
                        </option>
                      ))}
                    </Select>
                    <div className="flex items-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => moveChecklistItem(index, 'up')}>Up</Button>
                      <Button variant="ghost" size="sm" onClick={() => moveChecklistItem(index, 'down')}>Down</Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(item.id)}>Delete</Button>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label="New checklist item"
            value={newChecklistTitle}
            onChange={(event) => setNewChecklistTitle(event.target.value)}
            placeholder="Add appraisal prep task"
          />
          <Input
            label="Due date"
            type="date"
            value={newChecklistDue}
            onChange={(event) => setNewChecklistDue(event.target.value)}
          />
          <div className="flex items-end">
            <Button variant="secondary" onClick={addChecklistItem}>Add item</Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-text-primary">Outcome</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Outcome status"
            value={draft.outcomeStatus}
            onChange={(event) => setDraft((prev) => ({ ...prev, outcomeStatus: event.target.value }))}
          >
            {OUTCOME_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {draft.outcomeStatus === 'won' && (
            <>
              <Input
                label="Expected list date"
                type="date"
                value={draft.expectedListDate}
                onChange={(event) => setDraft((prev) => ({ ...prev, expectedListDate: event.target.value }))}
              />
              <Input
                label="Expected price guide min"
                type="number"
                value={draft.expectedPriceGuideMin}
                onChange={(event) => setDraft((prev) => ({ ...prev, expectedPriceGuideMin: event.target.value }))}
              />
              <Input
                label="Expected price guide max"
                type="number"
                value={draft.expectedPriceGuideMax}
                onChange={(event) => setDraft((prev) => ({ ...prev, expectedPriceGuideMax: event.target.value }))}
              />
            </>
          )}
          {draft.outcomeStatus === 'lost' && (
            <>
              <Select
                label="Lost reason"
                value={draft.lostReason}
                onChange={(event) => setDraft((prev) => ({ ...prev, lostReason: event.target.value }))}
              >
                <option value="">Select reason</option>
                {LOST_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Textarea
                label="Lost notes"
                value={draft.lostNotes}
                onChange={(event) => setDraft((prev) => ({ ...prev, lostNotes: event.target.value }))}
                rows={3}
              />
            </>
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-text-primary">Follow-up actions</p>
          <Button variant="secondary" onClick={createFollowupPlan}>
            Create follow-up plan
          </Button>
        </div>
        {followups.length === 0 ? (
          <p className="text-sm text-text-secondary">No follow-ups scheduled yet.</p>
        ) : (
          <div className="space-y-2">
            {followups.map((followup) => (
              <div key={followup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle p-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{followup.title}</p>
                  <p className="text-xs text-text-tertiary">Due {formatDateTime(followup.dueAt)}</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={followup.isDone}
                    onChange={(event) => updateFollowup(followup, { isDone: event.target.checked })}
                  />
                  Done
                </label>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveAppraisal} disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
