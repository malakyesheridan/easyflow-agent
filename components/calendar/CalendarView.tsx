'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Chip, GlassCard, Input, PageHeader, SectionHeader, Select } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { cn } from '@/lib/utils';

type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

type CalendarEvent = {
  id: string;
  kind: 'stored' | 'inspection' | 'appraisal' | 'reminder';
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  type: string;
  status: string | null;
  timezone: string | null;
  location: string | null;
  notes: string | null;
  related: {
    type: string;
    id: string | null;
    label: string | null;
    link: string | null;
  };
  source: {
    type: string | null;
    id: string | null;
  };
  context: {
    seller_intent_score: number | null;
    win_probability: number | null;
    campaign_health: number | null;
  };
  can_edit: boolean;
};

type FollowUpAction = {
  source_type: string;
  source_id: string;
  title: string;
  due_at: string | null;
  category: string;
  priority_label: string;
  reason: string;
  entity_label: string;
  entity_id: string;
  entity_type: string;
  deep_link: string;
  context: {
    seller_intent_score: number | null;
    win_probability: number | null;
    campaign_health: number | null;
  };
};

type FollowUpsResponse = {
  topActions: FollowUpAction[];
};

type RelatedOption = {
  id: string;
  label: string;
};

type EventDraft = {
  title: string;
  type: string;
  date: string;
  time: string;
  duration: number;
  allDay: boolean;
  timezone: string;
  location: string;
  notes: string;
  relatedType: string;
  relatedId: string;
  reminderType: string;
  reminderCustom: string;
  status: string;
};

type DraftSource = {
  source_type: string;
  source_id: string;
};

const VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' },
];

const EVENT_TYPE_OPTIONS = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'call_block', label: 'Call block' },
  { value: 'vendor_update', label: 'Vendor update' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'open_home', label: 'Open home' },
  { value: 'private_inspection', label: 'Private inspection' },
  { value: 'followup_block', label: 'Follow-up block' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'admin', label: 'Admin' },
];

const RELATED_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'contact', label: 'Contact' },
  { value: 'listing', label: 'Listing' },
  { value: 'appraisal', label: 'Appraisal' },
];

const REMINDER_OPTIONS = [
  { value: 'none', label: 'No reminder' },
  { value: '15', label: '15 minutes before' },
  { value: '60', label: '60 minutes before' },
  { value: 'custom', label: 'Custom minutes' },
];

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EVENT_STYLES: Record<string, string> = {
  call_block: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
  vendor_update: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
  appraisal: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
  open_home: 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30',
  private_inspection: 'bg-teal-500/15 text-teal-200 border border-teal-500/30',
  meeting: 'bg-bg-section text-text-secondary border border-border-subtle',
  admin: 'bg-slate-500/10 text-text-secondary border border-border-subtle',
  followup_block: 'bg-blue-500/15 text-blue-200 border border-blue-500/30',
  reminder: 'bg-bg-section/60 text-text-tertiary border border-border-subtle',
};

const DEFAULT_DURATIONS: Record<string, number> = {
  call_block: 60,
  vendor_update: 10,
  appraisal: 45,
  open_home: 60,
  private_inspection: 30,
  followup_block: 30,
  meeting: 60,
  admin: 30,
  reminder: 30,
};

function getDefaultDuration(type: string) {
  return DEFAULT_DURATIONS[type] ?? DEFAULT_DURATIONS.meeting;
}

function getTypeForFollowup(sourceType: string) {
  switch (sourceType) {
    case 'contact_followup':
      return 'call_block';
    case 'appraisal_checklist_item':
    case 'appraisal_followup':
      return 'appraisal';
    case 'listing_checklist_item':
      return 'admin';
    case 'listing_milestone':
      return 'reminder';
    case 'buyer_followup':
      return 'followup_block';
    case 'vendor_report_due':
    case 'vendor_comm_overdue':
      return 'vendor_update';
    default:
      return 'followup_block';
  }
}

const DEFAULT_DRAFT: EventDraft = {
  title: '',
  type: 'meeting',
  date: '',
  time: '09:00',
  duration: 60,
  allDay: false,
  timezone: 'UTC',
  location: '',
  notes: '',
  relatedType: 'none',
  relatedId: '',
  reminderType: 'none',
  reminderCustom: '',
  status: 'scheduled',
};

const HOUR_HEIGHT = 56;
const MINUTES_IN_DAY = 24 * 60;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function addMonths(date: Date, months: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = (day + 6) % 7;
  value.setDate(value.getDate() - diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(date: Date) {
  const value = new Date(date);
  value.setDate(1);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfMonth(date: Date) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + 1);
  value.setDate(0);
  value.setHours(23, 59, 59, 999);
  return value;
}

function getDaysInRange(start: Date, end: Date) {
  const days: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }
  return days;
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function parseEventDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function minutesFromStartOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function buildDateTime(date: string, time: string) {
  if (!date) return null;
  const [year, month, day] = date.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  const [hour, minute] = time.split(':').map((part) => Number(part));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeInput(date: Date) {
  return date.toTimeString().slice(0, 5);
}

function eventOccursOnDay(event: CalendarEvent, day: Date) {
  const start = parseEventDate(event.starts_at);
  const end = parseEventDate(event.ends_at);
  if (!start || !end) return false;
  if (!event.all_day) return isSameDay(start, day);
  return start <= endOfDay(day) && end >= startOfDay(day);
}

function buildEventStyle(type: string) {
  return EVENT_STYLES[type] || EVENT_STYLES.meeting;
}

export default function CalendarView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';
  const timezone = config?.timezone ?? 'Local time';

  const [view, setView] = useState<CalendarViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actions, setActions] = useState<FollowUpAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(DEFAULT_DRAFT);
  const [draftSource, setDraftSource] = useState<DraftSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [relatedSearch, setRelatedSearch] = useState('');
  const [relatedOptions, setRelatedOptions] = useState<RelatedOption[]>([]);

  const range = useMemo(() => {
    if (view === 'month') {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return {
        start: startOfWeek(monthStart),
        end: endOfWeek(monthEnd),
      };
    }
    if (view === 'week') {
      const weekStart = startOfWeek(currentDate);
      return { start: weekStart, end: endOfWeek(weekStart) };
    }
    if (view === 'day') {
      const start = startOfDay(currentDate);
      return { start, end: endOfDay(start) };
    }
    const start = startOfDay(currentDate);
    return { start, end: addDays(start, 30) };
  }, [view, currentDate]);

  const fetchEvents = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        orgId,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        view,
      });
      const res = await fetch(`/api/calendar/events?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load calendar events');
      setEvents((json.data?.data ?? json.data ?? []) as CalendarEvent[]);
    } catch (err) {
      setEvents([]);
      setError(err instanceof Error ? err.message : 'Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  }, [orgId, range.start, range.end, view]);

  const fetchActions = useCallback(async () => {
    if (!orgId) return;
    setActionsLoading(true);
    try {
      const res = await fetch(`/api/follow-ups?orgId=${orgId}&mode=daily`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error('Failed to load follow-ups');
      setActions((json.data as FollowUpsResponse)?.topActions ?? []);
    } catch {
      setActions([]);
    } finally {
      setActionsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    void fetchActions();
  }, [fetchActions]);

  useEffect(() => {
    if (!relatedSearch || draft.relatedType === 'none' || !orgId) {
      setRelatedOptions([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const query = new URLSearchParams({ orgId, q: relatedSearch, pageSize: '5' });
        let endpoint = '/api/contacts';
        if (draft.relatedType === 'listing') endpoint = '/api/listings';
        if (draft.relatedType === 'appraisal') endpoint = '/api/appraisals';
        const res = await fetch(`${endpoint}?${query.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Search failed');
        const rows = json.data?.data ?? json.data ?? [];
        const mapped = rows.map((row: any) => {
          if (draft.relatedType === 'listing') {
            const label = `${row.address ?? row.addressLine1 ?? 'Listing'}${row.suburb ? `, ${row.suburb}` : ''}`;
            return { id: row.id, label };
          }
          if (draft.relatedType === 'appraisal') {
            return { id: row.id, label: row.contactName ?? row.contact?.fullName ?? row.contact ?? 'Appraisal' };
          }
          return { id: row.id, label: row.fullName ?? row.name ?? row.email ?? 'Contact' };
        });
        if (!cancelled) setRelatedOptions(mapped);
      } catch {
        if (!cancelled) setRelatedOptions([]);
      }
    };

    const id = setTimeout(load, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [draft.relatedType, relatedSearch, orgId]);

  const scheduledKeys = useMemo(() => {
    const set = new Set<string>();
    events.forEach((event) => {
      if (event.kind === 'stored' && event.source?.type && event.source?.id) {
        set.add(`${event.source.type}:${event.source.id}`);
      }
    });
    return set;
  }, [events]);

  const unscheduledActions = useMemo(() => {
    return actions.filter((action) => !scheduledKeys.has(`${action.source_type}:${action.source_id}`));
  }, [actions, scheduledKeys]);

  const monthDays = useMemo(() => {
    if (view !== 'month') return [];
    return getDaysInRange(range.start, range.end);
  }, [view, range.start, range.end]);

  const weekDays = useMemo(() => {
    if (view === 'week') {
      return getDaysInRange(startOfWeek(currentDate), endOfWeek(currentDate));
    }
    if (view === 'day') {
      return [currentDate];
    }
    return [];
  }, [view, currentDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const start = parseEventDate(event.starts_at);
      const end = parseEventDate(event.ends_at);
      if (!start || !end) return;
      if (event.all_day) {
        let current = startOfDay(start);
        const last = endOfDay(end);
        while (current <= last) {
          const key = getDateKey(current);
          const list = map.get(key) ?? [];
          list.push(event);
          map.set(key, list);
          current = addDays(current, 1);
        }
        return;
      }
      const key = getDateKey(start);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    });
    return map;
  }, [events]);

  const agendaGroups = useMemo(() => {
    if (view !== 'agenda') return [];
    const grouped = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const start = parseEventDate(event.starts_at);
      if (!start) return;
      const key = getDateKey(start);
      const list = grouped.get(key) ?? [];
      list.push(event);
      grouped.set(key, list);
    });
    return Array.from(grouped.entries())
      .map(([key, list]) => ({
        key,
        date: new Date(key),
        items: list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events, view]);

  const navigate = (direction: 'prev' | 'next') => {
    if (view === 'month') {
      setCurrentDate(addMonths(currentDate, direction === 'prev' ? -1 : 1));
      return;
    }
    if (view === 'week') {
      setCurrentDate(addDays(currentDate, direction === 'prev' ? -7 : 7));
      return;
    }
    if (view === 'day') {
      setCurrentDate(addDays(currentDate, direction === 'prev' ? -1 : 1));
      return;
    }
    setCurrentDate(addDays(currentDate, direction === 'prev' ? -7 : 7));
  };

  const openCreateModal = (date?: Date, minutes?: number) => {
    const baseDate = date ?? new Date();
    const startTime = minutes !== undefined ? addDays(startOfDay(baseDate), 0) : baseDate;
    if (minutes !== undefined) {
      startTime.setMinutes(minutes);
    }
    setDraft({
      ...DEFAULT_DRAFT,
      title: '',
      date: formatDateInput(baseDate),
      time: formatTimeInput(startTime),
      duration: getDefaultDuration(DEFAULT_DRAFT.type),
      timezone: config?.timezone ?? 'UTC',
    });
    setDraftSource(null);
    setEditingEvent(null);
    setModalError(null);
    setModalOpen(true);
  };

  const openScheduleFromAction = (action: FollowUpAction) => {
    const baseDate = action.due_at ? new Date(action.due_at) : new Date();
    const type = getTypeForFollowup(action.source_type);
    setDraft({
      ...DEFAULT_DRAFT,
      title: action.title,
      type,
      date: formatDateInput(baseDate),
      time: formatTimeInput(baseDate),
      duration: getDefaultDuration(type),
      timezone: config?.timezone ?? 'UTC',
    });
    setDraftSource({ source_type: action.source_type, source_id: action.source_id });
    setEditingEvent(null);
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    if (!event.can_edit) {
      if (event.related?.link) {
        window.open(event.related.link, '_blank');
      }
      return;
    }
    const start = parseEventDate(event.starts_at) ?? new Date();
    const end = parseEventDate(event.ends_at) ?? addDays(start, 0);
    const duration = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));

    setDraft({
      title: event.title,
      type: event.type,
      date: formatDateInput(start),
      time: formatTimeInput(start),
      duration,
      allDay: event.all_day,
      timezone: event.timezone ?? config?.timezone ?? 'UTC',
      location: event.location ?? '',
      notes: event.notes ?? '',
      relatedType: event.related?.type ?? 'none',
      relatedId: event.related?.id ?? '',
      reminderType: 'none',
      reminderCustom: '',
      status: event.status ?? 'scheduled',
    });
    setDraftSource(event.source?.type && event.source?.id ? { source_type: event.source.type, source_id: event.source.id } : null);
    setEditingEvent(event);
    setModalError(null);
    setModalOpen(true);
  };

  const handleTypeChange = (value: string) => {
    setDraft((prev) => {
      const prevDefault = getDefaultDuration(prev.type);
      const nextDefault = getDefaultDuration(value);
      const duration = prev.duration === prevDefault ? nextDefault : prev.duration;
      return { ...prev, type: value, duration };
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEvent(null);
    setDraftSource(null);
    setModalError(null);
    setRelatedSearch('');
  };

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    setModalError(null);
    const start = draft.allDay ? startOfDay(new Date(draft.date)) : buildDateTime(draft.date, draft.time);
    if (!start) {
      setModalError('Choose a valid date and time.');
      setSaving(false);
      return;
    }
    const end = draft.allDay
      ? endOfDay(start)
      : new Date(start.getTime() + Math.max(15, draft.duration) * 60000);

    const reminderMinutes = (() => {
      if (draft.reminderType === 'custom' && draft.reminderCustom) {
        const value = Number(draft.reminderCustom);
        return Number.isFinite(value) ? [value] : [];
      }
      if (draft.reminderType !== 'none' && draft.reminderType !== 'custom') {
        return [Number(draft.reminderType)];
      }
      return [];
    })();

    try {
      if (draftSource) {
        const res = await fetch('/api/calendar/schedule-from-followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            source_type: draftSource.source_type,
            source_id: draftSource.source_id,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            timezone: draft.timezone,
            title: draft.title,
            notes: draft.notes,
            location: draft.location,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to schedule follow-up');
      } else if (editingEvent) {
        const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            title: draft.title,
            type: draft.type,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            all_day: draft.allDay,
            timezone: draft.timezone,
            location: draft.location,
            notes: draft.notes,
            related_entity_type: draft.relatedType,
            related_entity_id: draft.relatedId || undefined,
            status: draft.status,
            reminder_minutes: reminderMinutes.length ? reminderMinutes : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update event');
      } else {
        const res = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            title: draft.title,
            type: draft.type,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            all_day: draft.allDay,
            timezone: draft.timezone,
            location: draft.location,
            notes: draft.notes,
            related_entity_type: draft.relatedType,
            related_entity_id: draft.relatedId || undefined,
            status: draft.status,
            reminder_minutes: reminderMinutes.length ? reminderMinutes : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to create event');
      }

      await fetchEvents();
      await fetchActions();
      closeModal();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to save event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent || !orgId) return;
    setSaving(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to delete event');
      await fetchEvents();
      closeModal();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to delete event');
    } finally {
      setSaving(false);
    }
  };

  const timedEventsForDay = (day: Date) => {
    return events
      .filter((event) => !event.all_day && eventOccursOnDay(event, day))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  };

  const allDayEventsForDay = (day: Date) => {
    return events
      .filter((event) => event.all_day && eventOccursOnDay(event, day))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        subtitle="Schedule follow-ups, inspections, appraisals, and vendor updates."
        actions={
          <div className="hidden md:flex items-center gap-2">
            <Button variant="secondary" onClick={() => setCurrentDate(new Date())}>Today</Button>
            <Button onClick={() => openCreateModal()}>Add event</Button>
          </div>
        }
      />

      <GlassCard className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('prev')}>
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('next')}>
            Next
          </Button>
          <span className="text-sm font-semibold text-text-primary">
            {view === 'month' && currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            {view === 'week' && `${formatDate(range.start)} - ${formatDate(range.end)}`}
            {view === 'day' && formatLongDate(currentDate)}
            {view === 'agenda' && `Next 30 days`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {VIEW_OPTIONS.map((option) => (
            <Chip key={option.value} active={view === option.value} onClick={() => setView(option.value)}>
              {option.label}
            </Chip>
          ))}
          <span className="text-xs text-text-tertiary">Timezone: {timezone}</span>
          <InfoTooltip
            label="Calendar help"
            content={
              <div className="space-y-2">
                <p className="text-xs text-text-secondary">Derived reminders show report due dates and milestone timing.</p>
                <p className="text-xs text-text-secondary">Use the right panel to schedule top follow-ups into the calendar.</p>
              </div>
            }
          />
          <InfoTooltip
            label="Event types info"
            content={
              <div className="space-y-2">
                <p className="text-xs text-text-secondary">Event types help you scan priorities fast.</p>
                <ul className="list-disc pl-4 text-xs text-text-secondary space-y-1">
                  <li>Vendor update: reporting and vendor comms.</li>
                  <li>Appraisal: appointment blocks.</li>
                  <li>Open home / inspection: listing activity.</li>
                  <li>Follow-up block: nurture or call time.</li>
                </ul>
              </div>
            }
          />
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <Button variant="secondary" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button size="sm" onClick={() => openCreateModal()}>Add event</Button>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <GlassCard>
              <p className="text-sm text-text-tertiary">Loading calendar...</p>
            </GlassCard>
          ) : (
            <GlassCard className="p-0 overflow-hidden">
              {view === 'month' && (
                <div className="grid grid-cols-7 border-b border-border-subtle text-xs uppercase text-text-tertiary bg-bg-section/40">
                  {DAY_LABELS.map((day) => (
                    <div key={day} className="px-3 py-2 border-r border-border-subtle last:border-r-0">{day}</div>
                  ))}
                  {monthDays.map((day) => {
                    const dayKey = getDateKey(day);
                    const dayEvents = eventsByDay.get(dayKey) ?? [];
                    return (
                      <div
                        key={dayKey}
                        className={cn(
                          'min-h-[110px] border-t border-r border-border-subtle p-2 cursor-pointer hover:bg-bg-section/40 transition-colors',
                          !isSameMonth(day, currentDate) && 'bg-bg-section/20 text-text-tertiary'
                        )}
                        onClick={() => openCreateModal(day)}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn('text-xs font-semibold', isSameDay(day, new Date()) && 'text-accent-gold')}>
                            {day.getDate()}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(event);
                              }}
                              className={cn('w-full rounded-md px-2 py-1 text-left text-[11px] truncate', buildEventStyle(event.type))}
                            >
                              {event.title}
                            </button>
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="text-[10px] text-text-tertiary">+{dayEvents.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(view === 'week' || view === 'day') && (
                <div className="flex flex-col">
                  <div className="grid" style={{ gridTemplateColumns: `80px repeat(${weekDays.length}, minmax(0, 1fr))` }}>
                    <div className="border-b border-border-subtle bg-bg-section/40"></div>
                    {weekDays.map((day) => (
                      <div key={`header-${day.toISOString()}`} className="border-b border-border-subtle px-3 py-2 text-xs text-text-tertiary">
                        <div className="text-sm font-semibold text-text-primary">
                          {formatLongDate(day)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {allDayEventsForDay(day).map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => openEditModal(event)}
                              className={cn('rounded-md px-2 py-1 text-[11px]', buildEventStyle(event.type))}
                            >
                              {event.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: `80px repeat(${weekDays.length}, minmax(0, 1fr))` }}>
                    <div className="border-r border-border-subtle">
                      {Array.from({ length: 24 }).map((_, hour) => (
                        <div key={`hour-${hour}`} className="h-[56px] border-b border-border-subtle px-2 text-[11px] text-text-tertiary">
                          {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                        </div>
                      ))}
                    </div>
                    {weekDays.map((day) => (
                      <div
                        key={`day-${day.toISOString()}`}
                        className="relative border-r border-border-subtle"
                        style={{ height: `${HOUR_HEIGHT * 24}px` }}
                        onClick={(event) => {
                          const bounds = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                          const offset = event.clientY - bounds.top;
                          const minutes = Math.max(0, Math.min(MINUTES_IN_DAY - 15, Math.round((offset / (HOUR_HEIGHT * 24)) * MINUTES_IN_DAY)));
                          openCreateModal(day, minutes);
                        }}
                      >
                        {Array.from({ length: 24 }).map((_, hour) => (
                          <div key={`grid-${day.toISOString()}-${hour}`} className="h-[56px] border-b border-border-subtle" />
                        ))}
                        {timedEventsForDay(day).map((event) => {
                          const start = parseEventDate(event.starts_at);
                          const end = parseEventDate(event.ends_at);
                          if (!start || !end) return null;
                          const top = (minutesFromStartOfDay(start) / MINUTES_IN_DAY) * (HOUR_HEIGHT * 24);
                          const height = Math.max(24, ((end.getTime() - start.getTime()) / 60000 / MINUTES_IN_DAY) * (HOUR_HEIGHT * 24));
                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(event);
                              }}
                              className={cn('absolute left-2 right-2 rounded-md px-2 py-1 text-[11px] text-left shadow-soft', buildEventStyle(event.type))}
                              style={{ top, height }}
                            >
                              <div className="font-semibold truncate">{event.title}</div>
                              <div className="text-[10px] text-text-tertiary">
                                {formatTime(start)} - {formatTime(end)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {view === 'agenda' && (
                <div className="p-4 space-y-4">
                  {agendaGroups.length === 0 ? (
                    <p className="text-sm text-text-tertiary">No events scheduled for this range.</p>
                  ) : (
                    agendaGroups.map((group) => (
                      <div key={group.key} className="space-y-2">
                        <p className="text-sm font-semibold text-text-primary">{formatLongDate(group.date)}</p>
                        {group.items.map((event) => {
                          const start = parseEventDate(event.starts_at);
                          const end = parseEventDate(event.ends_at);
                          return (
                            <div key={event.id} className="flex items-center justify-between gap-3 rounded-md border border-border-subtle p-3">
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(event)}
                                  className="text-sm font-semibold text-text-primary hover:underline"
                                >
                                  {event.title}
                                </button>
                                <div className="text-xs text-text-tertiary">
                                  {event.all_day ? 'All day' : start && end ? `${formatTime(start)} - ${formatTime(end)}` : ''}
                                </div>
                              </div>
                              <Badge className={buildEventStyle(event.type)}>{event.type.replace('_', ' ')}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}
            </GlassCard>
          )}
        </div>

        <GlassCard className="space-y-4">
          <SectionHeader
            title="Unscheduled Top Actions"
            subtitle="Schedule high-priority follow-ups"
            actions={
              <InfoTooltip
                label="Scheduling help"
                content={<p className="text-xs text-text-secondary">Schedule follow-ups into time blocks to clear the daily queue.</p>}
              />
            }
          />
          {actionsLoading ? (
            <p className="text-sm text-text-tertiary">Loading actions...</p>
          ) : unscheduledActions.length === 0 ? (
            <p className="text-sm text-text-tertiary">No unscheduled follow-ups right now.</p>
          ) : (
            <div className="space-y-3">
              {unscheduledActions.slice(0, 8).map((action) => (
                <div key={`${action.source_type}-${action.source_id}`} className="rounded-md border border-border-subtle p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{action.title}</p>
                      <p className="text-xs text-text-tertiary">{action.reason}</p>
                    </div>
                    <Badge className="bg-bg-section text-text-secondary">{action.priority_label}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={action.deep_link} className="text-xs text-text-secondary hover:underline">
                      {action.entity_label}
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => openScheduleFromAction(action)}>
                      Schedule
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative w-full max-w-2xl rounded-xl border border-border-subtle bg-bg-base p-6 shadow-lift">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-text-primary">
                  {editingEvent ? 'Edit event' : draftSource ? 'Schedule follow-up' : 'Add event'}
                </p>
                <p className="text-xs text-text-tertiary">Tie events to contacts, listings, or appraisals.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={closeModal}>
                Close
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                label="Title"
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Vendor update call"
              />
              <Select
                label="Type"
                value={draft.type}
                onChange={(event) => handleTypeChange(event.target.value)}
                disabled={Boolean(draftSource)}
              >
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Date"
                type="date"
                value={draft.date}
                onChange={(event) => setDraft((prev) => ({ ...prev, date: event.target.value }))}
              />
              {!draft.allDay && (
                <Input
                  label="Time"
                  type="time"
                  value={draft.time}
                  onChange={(event) => setDraft((prev) => ({ ...prev, time: event.target.value }))}
                />
              )}
              {!draft.allDay && (
                <Input
                  label="Duration (min)"
                  type="number"
                  value={draft.duration}
                  onChange={(event) => setDraft((prev) => ({ ...prev, duration: Number(event.target.value) || 30 }))}
                />
              )}
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.allDay}
                  onChange={(event) => setDraft((prev) => ({ ...prev, allDay: event.target.checked }))}
                />
                All day
              </label>
              <Input
                label="Location"
                value={draft.location}
                onChange={(event) => setDraft((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="Office or suburb"
              />
              <Input
                label="Timezone"
                value={draft.timezone}
                onChange={(event) => setDraft((prev) => ({ ...prev, timezone: event.target.value }))}
              />
              <Select
                label="Reminder"
                value={draft.reminderType}
                onChange={(event) => setDraft((prev) => ({ ...prev, reminderType: event.target.value }))}
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {draft.reminderType === 'custom' && (
                <Input
                  label="Custom reminder (minutes)"
                  type="number"
                  value={draft.reminderCustom}
                  onChange={(event) => setDraft((prev) => ({ ...prev, reminderCustom: event.target.value }))}
                />
              )}
              <Select
                label="Status"
                value={draft.status}
                onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            {!draftSource && (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <Select
                  label="Related entity"
                  value={draft.relatedType}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, relatedType: event.target.value, relatedId: '' }));
                    setRelatedSearch('');
                    setRelatedOptions([]);
                  }}
                >
                  {RELATED_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                {draft.relatedType !== 'none' && (
                  <Input
                    label="Search"
                    value={relatedSearch}
                    onChange={(event) => setRelatedSearch(event.target.value)}
                    placeholder="Start typing..."
                  />
                )}
                {draft.relatedType !== 'none' && relatedOptions.length > 0 && (
                  <Select
                    label="Results"
                    value={draft.relatedId}
                    onChange={(event) => setDraft((prev) => ({ ...prev, relatedId: event.target.value }))}
                  >
                    <option value="">Select</option>
                    {relatedOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            <div className="mt-4">
              <Input
                label="Notes"
                value={draft.notes}
                onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>

            {modalError && (
              <p className="mt-3 text-sm text-destructive">{modalError}</p>
            )}

            <div className="mt-6 flex items-center justify-between">
              {editingEvent && (
                <Button variant="ghost" onClick={handleDelete} disabled={saving}>
                  Delete
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={closeModal} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
