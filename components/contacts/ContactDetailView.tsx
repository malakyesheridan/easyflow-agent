'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Input, Select, Textarea } from '@/components/ui';
import { useOrgConfig } from '@/hooks/useOrgConfig';

const ROLE_OPTIONS = [
  { value: 'seller', label: 'Seller' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'both', label: 'Both' },
  { value: 'unknown', label: 'Unknown' },
];

const TEMP_OPTIONS = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
  { value: 'unknown', label: 'Unknown' },
];

type Tag = { id: string; name: string; color: string | null };

type Owner = { id: string; name: string | null; email: string | null };

type ContactDetail = {
  id: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
  role: string;
  sellerStage: string | null;
  temperature: string;
  leadSource: string | null;
  lastTouchAt: string | null;
  nextTouchAt: string | null;
  owner: Owner | null;
  doNotContact: boolean;
  marketingOptIn: boolean;
  tags: Tag[];
};

type Activity = {
  id: string;
  type: string;
  content: string | null;
  occurredAt: string | null;
};

type DraftState = {
  role: string;
  sellerStage: string;
  temperature: string;
  leadSource: string;
  address: string;
  suburb: string;
  ownerUserId: string;
  tagsInput: string;
  nextTouchAt: string;
  doNotContact: boolean;
  marketingOptIn: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toInputDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseTagsInput(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export default function ContactDetailView({ contactId }: { contactId: string }) {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [noteContent, setNoteContent] = useState('');
  const [callContent, setCallContent] = useState('');

  const [draft, setDraft] = useState<DraftState>({
    role: 'unknown',
    sellerStage: '',
    temperature: 'unknown',
    leadSource: '',
    address: '',
    suburb: '',
    ownerUserId: '',
    tagsInput: '',
    nextTouchAt: '',
    doNotContact: false,
    marketingOptIn: false,
  });

  useEffect(() => {
    if (!orgId || !contactId) return;
    let cancelled = false;

    const loadContact = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/contacts/${contactId}?orgId=${orgId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load contact');
        if (!cancelled) {
          setContact(json.data as ContactDetail);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load contact');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadContact();
    return () => {
      cancelled = true;
    };
  }, [orgId, contactId]);

  useEffect(() => {
    if (!orgId || !contactId) return;
    let cancelled = false;

    const loadActivities = async () => {
      try {
        const res = await fetch(`/api/contacts/${contactId}/activities?orgId=${orgId}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load activity');
        if (!cancelled) setActivities(json.data ?? []);
      } catch {
        if (!cancelled) setActivities([]);
      }
    };

    void loadActivities();
    return () => {
      cancelled = true;
    };
  }, [orgId, contactId]);

  useEffect(() => {
    if (!orgId) return;
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

    const loadTags = async () => {
      try {
        const res = await fetch(`/api/tags?orgId=${orgId}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load tags');
        if (!cancelled) setTags(json.data ?? []);
      } catch {
        if (!cancelled) setTags([]);
      }
    };

    void loadOwners();
    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!contact) return;
    setDraft({
      role: contact.role,
      sellerStage: contact.sellerStage ?? '',
      temperature: contact.temperature,
      leadSource: contact.leadSource ?? '',
      address: contact.address ?? '',
      suburb: contact.suburb ?? '',
      ownerUserId: contact.owner?.id ?? '',
      tagsInput: contact.tags.map((tag) => tag.name).join(', '),
      nextTouchAt: toInputDate(contact.nextTouchAt),
      doNotContact: contact.doNotContact,
      marketingOptIn: contact.marketingOptIn,
    });
  }, [contact]);

  const tagOptions = useMemo(() => tags.map((tag) => tag.name), [tags]);

  const saveContact = async (overrides?: Partial<DraftState>) => {
    if (!orgId || !contactId) return;
    const nextDraft = { ...draft, ...overrides };
    const nextTouchDate = nextDraft.nextTouchAt ? new Date(nextDraft.nextTouchAt) : null;
    const nextTouchAt = nextTouchDate && !Number.isNaN(nextTouchDate.getTime())
      ? nextTouchDate.toISOString()
      : null;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          role: nextDraft.role,
          sellerStage: nextDraft.sellerStage || undefined,
          temperature: nextDraft.temperature,
          leadSource: nextDraft.leadSource || undefined,
          address: nextDraft.address || undefined,
          suburb: nextDraft.suburb || undefined,
          ownerUserId: nextDraft.ownerUserId || undefined,
          tags: parseTagsInput(nextDraft.tagsInput),
          nextTouchAt,
          doNotContact: nextDraft.doNotContact,
          marketingOptIn: nextDraft.marketingOptIn,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update contact');
      setContact(json.data as ContactDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update contact');
    } finally {
      setSaving(false);
    }
  };

  const addActivity = async (type: 'note' | 'call', content: string) => {
    if (!orgId || !contactId) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/contacts/${contactId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, type, content: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to add activity');
      setNoteContent('');
      setCallContent('');
      const activityRes = await fetch(`/api/contacts/${contactId}/activities?orgId=${orgId}`);
      const activityJson = await activityRes.json();
      if (activityRes.ok && activityJson.ok) setActivities(activityJson.data ?? []);
      const contactRes = await fetch(`/api/contacts/${contactId}?orgId=${orgId}`);
      const contactJson = await contactRes.json();
      if (contactRes.ok && contactJson.ok) setContact(contactJson.data as ContactDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity');
    }
  };

  const setFollowUp = async (days: number) => {
    if (!orgId || !contactId) return;
    const date = new Date();
    date.setDate(date.getDate() + days);
    const iso = date.toISOString().slice(0, 10);
    setDraft((prev) => ({ ...prev, nextTouchAt: iso }));
    await saveContact({ nextTouchAt: iso });
  };

  if (loading) {
    return <Card>Loading contact...</Card>;
  }

  if (!contact) {
    return <Card>Contact not found.</Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-text-primary">{contact.fullName}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="muted">{contact.role}</Badge>
              <Badge variant="muted">{contact.sellerStage || 'No stage'}</Badge>
              <Badge variant="muted">{contact.temperature}</Badge>
              {contact.tags.map((tag) => (
                <Badge key={tag.id} variant="muted">
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-sm text-text-tertiary">
            Owner: {contact.owner?.name || contact.owner?.email || 'Unassigned'}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="space-y-4">
          <p className="text-sm font-semibold text-text-primary">Overview</p>
          <div className="space-y-2 text-sm text-text-secondary">
            <p>Email: {contact.email || '-'}</p>
            <p>Phone: {contact.phone || '-'}</p>
            <p>Address: {contact.address || '-'}</p>
            <p>Suburb: {contact.suburb || '-'}</p>
            <p>Lead source: {contact.leadSource || '-'}</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <Select
              label="Role"
              value={draft.role}
              onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              label="Seller stage"
              value={draft.sellerStage}
              onChange={(event) => setDraft((prev) => ({ ...prev, sellerStage: event.target.value }))}
            />
            <Select
              label="Temperature"
              value={draft.temperature}
              onChange={(event) => setDraft((prev) => ({ ...prev, temperature: event.target.value }))}
            >
              {TEMP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              label="Lead source"
              value={draft.leadSource}
              onChange={(event) => setDraft((prev) => ({ ...prev, leadSource: event.target.value }))}
            />
            <Input
              label="Tags"
              value={draft.tagsInput}
              onChange={(event) => setDraft((prev) => ({ ...prev, tagsInput: event.target.value }))}
              placeholder={tagOptions.slice(0, 3).join(', ')}
            />
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
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={draft.doNotContact}
                onChange={(event) => setDraft((prev) => ({ ...prev, doNotContact: event.target.checked }))}
              />
              Do not contact
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={draft.marketingOptIn}
                onChange={(event) => setDraft((prev) => ({ ...prev, marketingOptIn: event.target.checked }))}
              />
              Marketing opt-in
            </label>
          </div>
          <Button onClick={() => void saveContact()} disabled={saving}>
            {saving ? 'Saving...' : 'Save updates'}
          </Button>
        </Card>

        <Card className="space-y-4">
          <p className="text-sm font-semibold text-text-primary">Follow-up</p>
          <div className="space-y-2 text-sm text-text-secondary">
            <p>Last touch: {formatDateTime(contact.lastTouchAt)}</p>
            <p>Next touch: {formatDateTime(contact.nextTouchAt)}</p>
          </div>
          <Input
            label="Set next follow-up"
            type="date"
            value={draft.nextTouchAt}
            onChange={(event) => setDraft((prev) => ({ ...prev, nextTouchAt: event.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFollowUp(1)}>
              Tomorrow
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setFollowUp(7)}>
              Next week
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void saveContact()}>
              Save date
            </Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <p className="text-sm font-semibold text-text-primary">Quick actions</p>
          <Textarea
            label="Add note"
            value={noteContent}
            onChange={(event) => setNoteContent(event.target.value)}
            placeholder="Add context for the next call."
            rows={4}
          />
          <Button onClick={() => addActivity('note', noteContent)}>Save note</Button>
          <Textarea
            label="Log call"
            value={callContent}
            onChange={(event) => setCallContent(event.target.value)}
            placeholder="Call summary or outcome."
            rows={3}
          />
          <Button variant="secondary" onClick={() => addActivity('call', callContent)}>
            Log call
          </Button>
        </Card>
      </div>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">Timeline</p>
        {activities.length === 0 ? (
          <p className="text-sm text-text-secondary">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">
                    {activity.type.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-text-tertiary">{formatDateTime(activity.occurredAt)}</p>
                </div>
                {activity.content && <p className="mt-2 text-sm text-text-secondary">{activity.content}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
