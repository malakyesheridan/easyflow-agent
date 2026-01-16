'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Chip, GlassCard, Input, MetricCard, PageHeader, SectionHeader, Select } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { cn } from '@/lib/utils';

type FollowUpMode = 'daily' | 'weekly' | 'monthly';

type ActionItem = {
  source_type: string;
  source_id: string;
  title: string;
  due_at: string | null;
  category: 'prospecting' | 'appraisals' | 'listings' | 'vendor_reporting' | 'buyer_followups';
  priority_score: number;
  priority_label: 'Critical' | 'High' | 'Normal';
  reason: string;
  entity_type: 'contact' | 'appraisal' | 'listing' | 'report';
  entity_id: string;
  entity_label: string;
  deep_link: string;
  context: {
    seller_intent_score: number | null;
    win_probability: number | null;
    campaign_health: number | null;
  };
  state: {
    is_completed: boolean;
    is_snoozed: boolean;
  };
  actions_allowed: {
    can_complete: boolean;
    can_snooze: boolean;
    can_open: boolean;
  };
};

type Group = {
  key: string;
  label: string;
  items: ActionItem[];
};

type FollowUpsResponse = {
  topActions: ActionItem[];
  groups: Group[];
  summary: {
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    completedToday: number;
  };
};

const MODE_OPTIONS: { value: FollowUpMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'appraisals', label: 'Appraisals' },
  { value: 'listings', label: 'Listings' },
  { value: 'vendor_reporting', label: 'Vendor Reporting' },
  { value: 'buyer_followups', label: 'Buyer Follow-ups' },
];

const CATEGORY_LABELS: Record<ActionItem['category'], string> = {
  prospecting: 'Prospecting',
  appraisals: 'Appraisals',
  listings: 'Listings',
  vendor_reporting: 'Vendor Reporting',
  buyer_followups: 'Buyer Follow-ups',
};

const CATEGORY_TOOLTIPS: Record<ActionItem['category'], string> = {
  prospecting: 'Contacts that need a seller nurture touchpoint or update.',
  appraisals: 'Appraisal prep items and follow-ups that move listings closer.',
  listings: 'Active listing milestones and checklist tasks to keep campaigns on track.',
  vendor_reporting: 'Vendor report cadence and update reminders to protect trust.',
  buyer_followups: 'Buyer follow-ups tied to active listings and inspections.',
};

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: 'Critical', label: 'Critical' },
  { value: 'High', label: 'High' },
  { value: 'Normal', label: 'Normal' },
];

const PRIORITY_STYLES: Record<ActionItem['priority_label'], string> = {
  Critical: 'bg-red-500/15 text-red-300',
  High: 'bg-amber-500/15 text-amber-300',
  Normal: 'bg-bg-section text-text-secondary',
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function setTime(base: Date, hour: number) {
  const next = new Date(base);
  next.setHours(hour, 0, 0, 0);
  return next;
}

function dateFromInput(value: string, hour: number) {
  const parts = value.split('-').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isTomorrow(date: Date, now: Date) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(date, tomorrow);
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDueDisplay(value: string | null, now: Date) {
  if (!value) {
    return { label: 'No due date', dateLabel: null, className: 'text-text-tertiary' };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: 'No due date', dateLabel: null, className: 'text-text-tertiary' };
  }

  const startToday = startOfDay(now);
  if (date.getTime() < startToday.getTime()) {
    return { label: 'Overdue', dateLabel: formatDate(value), className: 'text-red-300' };
  }

  if (isSameDay(date, now)) {
    return { label: 'Today', dateLabel: formatDate(value), className: 'text-amber-300' };
  }

  if (isTomorrow(date, now)) {
    return { label: 'Tomorrow', dateLabel: formatDate(value), className: 'text-text-secondary' };
  }

  return { label: formatDate(value), dateLabel: null, className: 'text-text-secondary' };
}

function scoreBadge(score: number, type: 'intent' | 'win' | 'health') {
  if (type === 'intent') {
    if (score >= 80) return { label: `Intent ${score}`, variant: 'gold' as const };
    if (score >= 50) return { label: `Intent ${score}`, variant: 'default' as const };
    return { label: `Intent ${score}`, variant: 'muted' as const };
  }
  if (type === 'win') {
    if (score >= 75) return { label: `Win ${score}%`, variant: 'gold' as const };
    if (score >= 45) return { label: `Win ${score}%`, variant: 'default' as const };
    return { label: `Win ${score}%`, variant: 'muted' as const };
  }
  if (score >= 70) return { label: `Health ${score}`, variant: 'gold' as const };
  if (score >= 40) return { label: `Health ${score}`, variant: 'default' as const };
  return { label: `Health ${score}`, variant: 'muted' as const };
}

type FollowUpPayload = {
  next_touch_at?: string;
  next_follow_up_at?: string;
  status?: string;
};

type ActionRowProps = {
  item: ActionItem;
  pending: boolean;
  onComplete: (item: ActionItem, payload?: FollowUpPayload) => Promise<void>;
  onSnooze: (item: ActionItem, snoozedUntil: Date) => Promise<void>;
};

function FollowUpCompleteSelect({
  label,
  disabled,
  onComplete,
}: {
  label: string;
  disabled: boolean;
  onComplete: (date: Date) => void;
}) {
  const [customDate, setCustomDate] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [value, setValue] = useState('');

  const applyQuick = (days: number) => {
    const date = setTime(addDays(new Date(), days), 9);
    onComplete(date);
    setValue('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          if (!nextValue) return;
          if (nextValue === 'custom') {
            setShowCustom(true);
            return;
          }
          const days = Number(nextValue);
          if (!Number.isNaN(days)) {
            applyQuick(days);
            setShowCustom(false);
            setCustomDate('');
          }
        }}
        disabled={disabled}
        aria-label={label}
        className="h-9 rounded-md border border-border-subtle bg-bg-input px-2 text-xs text-text-secondary"
      >
        <option value="">{label}</option>
        <option value="1">Complete +1 day</option>
        <option value="3">Complete +3 days</option>
        <option value="7">Complete +1 week</option>
        <option value="custom">Pick date</option>
      </select>
      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customDate}
            onChange={(event) => setCustomDate(event.target.value)}
            className="h-9 rounded-md border border-border-subtle bg-bg-input px-2 text-xs text-text-secondary"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || !customDate}
            onClick={() => {
              const parsed = dateFromInput(customDate, 9);
              if (parsed) {
                onComplete(parsed);
                setCustomDate('');
                setShowCustom(false);
                setValue('');
              }
            }}
          >
            Set
          </Button>
        </div>
      )}
    </div>
  );
}

function SnoozeSelect({
  disabled,
  onSnooze,
}: {
  disabled: boolean;
  onSnooze: (date: Date) => void;
}) {
  const [customDate, setCustomDate] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [value, setValue] = useState('');

  const applyQuick = (days: number) => {
    const date = endOfDay(addDays(new Date(), days));
    onSnooze(date);
    setValue('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          if (!nextValue) return;
          if (nextValue === 'custom') {
            setShowCustom(true);
            return;
          }
          const days = Number(nextValue);
          if (!Number.isNaN(days)) {
            applyQuick(days);
            setShowCustom(false);
            setCustomDate('');
          }
        }}
        disabled={disabled}
        aria-label="Snooze"
        className="h-9 rounded-md border border-border-subtle bg-bg-input px-2 text-xs text-text-secondary"
      >
        <option value="">Snooze</option>
        <option value="1">1 day</option>
        <option value="3">3 days</option>
        <option value="7">1 week</option>
        <option value="custom">Pick date</option>
      </select>
      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customDate}
            onChange={(event) => setCustomDate(event.target.value)}
            className="h-9 rounded-md border border-border-subtle bg-bg-input px-2 text-xs text-text-secondary"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || !customDate}
            onClick={() => {
              const parsed = dateFromInput(customDate, 18);
              if (parsed) {
                onSnooze(endOfDay(parsed));
                setCustomDate('');
                setShowCustom(false);
                setValue('');
              }
            }}
          >
            Set
          </Button>
        </div>
      )}
    </div>
  );
}

function ActionRow({ item, pending, onComplete, onSnooze }: ActionRowProps) {
  const now = new Date();
  const due = getDueDisplay(item.due_at, now);
  const isContactFollowup = item.source_type === 'contact_followup';
  const isBuyerFollowup = item.source_type === 'buyer_followup';

  const contextBadges = [] as { label: string; variant: 'default' | 'gold' | 'muted' }[];
  if (item.context.seller_intent_score !== null) {
    contextBadges.push(scoreBadge(item.context.seller_intent_score, 'intent'));
  }
  if (item.context.win_probability !== null) {
    contextBadges.push(scoreBadge(item.context.win_probability, 'win'));
  }
  if (item.context.campaign_health !== null) {
    contextBadges.push(scoreBadge(item.context.campaign_health, 'health'));
  }

  const completeLabel = item.source_type === 'vendor_report_due'
    ? 'Generate report'
    : item.source_type === 'vendor_comm_overdue'
      ? 'Log update'
      : 'Complete';

  return (
    <div className="flex flex-col gap-3 border-b border-border-subtle/60 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-text-primary">{item.title}</p>
        <Badge className={PRIORITY_STYLES[item.priority_label]}>{item.priority_label}</Badge>
        <Badge variant="muted">{CATEGORY_LABELS[item.category]}</Badge>
      </div>
      <p className="text-xs text-text-secondary">{item.reason}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <Link href={item.deep_link} className="text-text-secondary hover:underline">
          {item.entity_label}
        </Link>
        {contextBadges.map((badge, index) => (
          <Badge key={`${item.source_id}-context-${index}`} variant={badge.variant}>
            {badge.label}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('font-semibold', due.className)}>{due.label}</span>
          {due.dateLabel && <span className="text-text-tertiary">{due.dateLabel}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.actions_allowed.can_complete && (isContactFollowup || isBuyerFollowup) ? (
            <FollowUpCompleteSelect
              label={isBuyerFollowup ? 'Complete buyer follow-up' : 'Complete contact follow-up'}
              disabled={pending}
              onComplete={(date) =>
                onComplete(item, {
                  next_touch_at: isContactFollowup ? date.toISOString() : undefined,
                  next_follow_up_at: isBuyerFollowup ? date.toISOString() : undefined,
                })
              }
            />
          ) : item.actions_allowed.can_complete ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => onComplete(item)}
            >
              {completeLabel}
            </Button>
          ) : null}
          {item.actions_allowed.can_snooze && (
            <SnoozeSelect
              disabled={pending}
              onSnooze={(date) => onSnooze(item, date)}
            />
          )}
          {item.actions_allowed.can_open && (
            <Link href={item.deep_link}>
              <Button type="button" size="sm" variant="ghost">
                Open
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FollowUpsView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [mode, setMode] = useState<FollowUpMode>('daily');
  const [owner, setOwner] = useState('any');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showTopActions, setShowTopActions] = useState(false);

  const [data, setData] = useState<FollowUpsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (mode === 'daily') setShowTopActions(true);
  }, [mode]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (!orgId) return params.toString();
    params.set('orgId', orgId);
    params.set('mode', mode);
    if (owner && owner !== 'any') params.set('owner', owner);
    if (category) params.set('category', category);
    if (priority) params.set('priority', priority);
    if (overdueOnly) params.set('overdue', 'true');
    if (search) params.set('search', search);
    return params.toString();
  }, [orgId, mode, owner, category, priority, overdueOnly, search]);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/follow-ups?${queryString}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load follow-ups');
      setData(json.data as FollowUpsResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  }, [orgId, queryString]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const setPending = useCallback((key: string, value: boolean) => {
    setPendingActions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleComplete = useCallback(
    async (item: ActionItem, payload?: FollowUpPayload) => {
      if (!orgId) return;
      const key = `${item.source_type}:${item.source_id}`;
      setPending(key, true);
      setActionMessage(null);
      try {
        const res = await fetch('/api/follow-ups/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            source_type: item.source_type,
            source_id: item.source_id,
            ...payload,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Unable to complete follow-up');
        if (json.data?.action === 'open' && json.data?.url) {
          window.location.href = json.data.url as string;
        }
        setActionMessage({ type: 'success', text: 'Action updated.' });
        await loadData();
      } catch (err) {
        setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Action failed' });
      } finally {
        setPending(key, false);
      }
    },
    [orgId, loadData, setPending]
  );

  const handleSnooze = useCallback(
    async (item: ActionItem, snoozedUntil: Date) => {
      if (!orgId) return;
      const key = `${item.source_type}:${item.source_id}`;
      setPending(key, true);
      setActionMessage(null);
      try {
        const res = await fetch('/api/follow-ups/snooze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            source_type: item.source_type,
            source_id: item.source_id,
            snoozed_until: snoozedUntil.toISOString(),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Unable to snooze follow-up');
        setActionMessage({ type: 'success', text: 'Follow-up snoozed.' });
        await loadData();
      } catch (err) {
        setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Snooze failed' });
      } finally {
        setPending(key, false);
      }
    },
    [orgId, loadData, setPending]
  );

  const resetFilters = () => {
    setOwner('any');
    setCategory('');
    setPriority('');
    setOverdueOnly(false);
    setSearchInput('');
    setSearch('');
  };

  const summary = data?.summary ?? { overdue: 0, dueToday: 0, dueThisWeek: 0, completedToday: 0 };
  const topActions = data?.topActions ?? [];
  const groups = data?.groups ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow Ups"
        subtitle="Your execution plan across prospecting, appraisals, listings, and vendor reporting."
        actions={
          <div className="hidden md:flex items-center gap-2">
            {MODE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={mode === option.value}
                onClick={() => setMode(option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard label="Overdue" value={summary.overdue} helper="Needs attention" />
        <MetricCard label="Due today" value={summary.dueToday} helper="Must complete" />
        <MetricCard label="Completed today" value={summary.completedToday} helper="Progress logged" />
      </div>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 md:hidden">
            {MODE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={mode === option.value}
                onClick={() => setMode(option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode !== 'daily' && (
              <Chip active={showTopActions} onClick={() => setShowTopActions((prev) => !prev)}>
                {showTopActions ? 'Hide top actions' : 'Show top actions'}
              </Chip>
            )}
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Contact, listing, appraisal"
          />
          <Select label="Owner" value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="any">Anyone</option>
            <option value="me">Me</option>
          </Select>
          <Select label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
            Overdue only
          </label>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <InfoTooltip
              label="How priority is calculated"
              content={
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary">Priority blends urgency with sales impact.</p>
                  <ul className="list-disc pl-4 text-xs text-text-secondary space-y-1">
                    <li>Overdue and due-today items rank higher.</li>
                    <li>Seller intent, win probability, and listing health adjust priority.</li>
                    <li>Vendor reports and appraisal follow-ups add extra weight.</li>
                  </ul>
                </div>
              }
            />
            Priority logic
          </div>
        </div>

        {actionMessage && (
          <p className={cn('text-xs', actionMessage.type === 'error' ? 'text-destructive' : 'text-text-secondary')}>
            {actionMessage.text}
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </GlassCard>

      {(mode === 'daily' || showTopActions) && (
        <GlassCard className="space-y-3" padding="none">
          <div className="border-b border-border-subtle px-4 py-3">
            <SectionHeader
              title="Top Actions"
              subtitle="Ranked focus list for today"
              actions={
                <InfoTooltip
                  label="Top actions info"
                  content={
                    <div className="space-y-2">
                      <p className="text-xs text-text-secondary">Top Actions surfaces the highest impact follow-ups.</p>
                      <ul className="list-disc pl-4 text-xs text-text-secondary space-y-1">
                        <li>Ranked by urgency, seller intent, win probability, and listing health.</li>
                        <li>Completing items updates source records automatically.</li>
                      </ul>
                    </div>
                  }
                />
              }
            />
          </div>
          <div className="px-4 pb-3">
            {loading ? (
              <p className="text-sm text-text-tertiary">Loading top actions...</p>
            ) : topActions.length === 0 ? (
              <p className="text-sm text-text-tertiary">No top actions match these filters.</p>
            ) : (
              topActions.map((item) => {
                const key = `${item.source_type}:${item.source_id}`;
                return (
                  <ActionRow
                    key={key}
                    item={item}
                    pending={Boolean(pendingActions[key])}
                    onComplete={handleComplete}
                    onSnooze={handleSnooze}
                  />
                );
              })
            )}
          </div>
        </GlassCard>
      )}

      <div className="space-y-4">
        {groups.length === 0 && !loading ? (
          <GlassCard>
            <p className="text-sm text-text-tertiary">No follow-ups scheduled for this view.</p>
          </GlassCard>
        ) : (
          groups.map((group) => (
            <GlassCard key={group.key} padding="none">
              <div className="border-b border-border-subtle px-4 py-3">
                <SectionHeader
                  title={group.label}
                  subtitle={`${group.items.length} items`}
                  actions={
                    mode === 'daily' && group.key in CATEGORY_TOOLTIPS ? (
                      <InfoTooltip
                        label={`${group.label} info`}
                        content={<p className="text-xs text-text-secondary">{CATEGORY_TOOLTIPS[group.key as ActionItem['category']]}</p>}
                      />
                    ) : undefined
                  }
                />
              </div>
              <div className="px-4 pb-3">
                {group.items.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No actions in this section.</p>
                ) : (
                  group.items.map((item) => {
                    const key = `${item.source_type}:${item.source_id}`;
                    return (
                      <ActionRow
                        key={key}
                        item={item}
                        pending={Boolean(pendingActions[key])}
                        onComplete={handleComplete}
                        onSnooze={handleSnooze}
                      />
                    );
                  })
                )}
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}
