'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Chip from '@/components/ui/Chip';
import type { CrewMember } from '@/db/schema/crew_members';
import { useOrgConfig } from '@/hooks/useOrgConfig';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type AnnouncementItem = {
  id: string;
  orgId: string;
  title: string;
  message: string;
  priority: 'normal' | 'urgent';
  recipientsType: 'all' | 'selected';
  createdByCrewMemberId: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
};

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <div className="h-4 w-56 rounded bg-bg-section/80" />
          <div className="mt-2 h-3 w-40 rounded bg-bg-section/80" />
        </Card>
      ))}
    </div>
  );
}

export default function AnnouncementsView({ orgId }: { orgId: string }) {
  const { config } = useOrgConfig();
  const resolvedOrgId = orgId || config?.orgId || '';
  const [items, setItems] = useState<AnnouncementItem[] | null>(null);
  const [crews, setCrews] = useState<CrewMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [ackLoadingId, setAckLoadingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [recipientsType, setRecipientsType] = useState<'all' | 'selected'>('all');
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const roleLabels = useMemo(() => {
    const map = new Map<string, string>();
    (config?.roles ?? []).forEach((role) => {
      map.set(String(role.key), String(role.name));
    });
    return map;
  }, [config?.roles]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [annRes, crewRes] = await Promise.all([
        fetch(`/api/announcements?orgId=${resolvedOrgId}&limit=50`),
        fetch(`/api/crews?orgId=${resolvedOrgId}&activeOnly=false`),
      ]);
      const annJson = (await annRes.json()) as ApiResponse<AnnouncementItem[]>;
      const crewJson = (await crewRes.json()) as ApiResponse<any[]>;

      if (!annRes.ok || !annJson.ok) throw new Error('Failed to load announcements');
      setItems(annJson.data);

      if (crewRes.ok && crewJson.ok) {
        setCrews(
          (crewJson.data ?? []).map((m) => ({
            ...m,
            createdAt: new Date(m.createdAt),
            updatedAt: new Date(m.updatedAt),
          }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load announcements');
      setItems([]);
    }
  }, [resolvedOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canCreate = title.trim().length > 0 && message.trim().length > 0 && (!creating);

  const create = useCallback(async () => {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const payload = {
        orgId: resolvedOrgId,
        title: title.trim(),
        message: message.trim(),
        priority,
        recipientsType,
        recipientCrewMemberIds: recipientsType === 'selected' ? selectedCrewIds : undefined,
      };
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to create announcement');
      setTitle('');
      setMessage('');
      setPriority('normal');
      setRecipientsType('all');
      setSelectedCrewIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create announcement');
    } finally {
      setCreating(false);
    }
  }, [canCreate, load, message, priority, recipientsType, resolvedOrgId, selectedCrewIds, title]);

  const toggleCrew = (id: string) => {
    setSelectedCrewIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const acknowledge = useCallback(
    async (announcementId: string) => {
      setAckLoadingId(announcementId);
      setError(null);
      try {
        const res = await fetch('/api/announcements/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId: resolvedOrgId, announcementId }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to acknowledge');
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to acknowledge');
      } finally {
        setAckLoadingId(null);
      }
    },
    [load, resolvedOrgId]
  );

  const selectedCrewLabel = useMemo(() => {
    if (recipientsType !== 'selected') return '';
    if (selectedCrewIds.length === 0) return 'No recipients selected';
    return `${selectedCrewIds.length} selected`;
  }, [recipientsType, selectedCrewIds.length]);

  if (items === null) return <Skeleton />;

  const announcementLabel = config?.vocabulary?.announcementSingular ?? 'Announcement';
  const announcementLabelLower = announcementLabel.toLowerCase();
  const crewPlural = config?.vocabulary?.crewPlural ?? 'Crew';

  return (
    <div className="space-y-5">
      {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Create {announcementLabelLower}</h2>
            <p className="text-xs text-text-tertiary mt-1">
              Admin-only. Urgent {announcementLabelLower}s require acknowledgement.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short headline" />
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </Select>
          <div className="md:col-span-2">
            <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What changed?" rows={4} />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Recipients</p>
              <p className="text-xs text-text-tertiary mt-1">
                {recipientsType === 'all' ? `All ${crewPlural.toLowerCase()}` : selectedCrewLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip active={recipientsType === 'all'} onClick={() => setRecipientsType('all')}>
                All
              </Chip>
              <Chip active={recipientsType === 'selected'} onClick={() => setRecipientsType('selected')}>
                Selected
              </Chip>
            </div>
          </div>

          {recipientsType === 'selected' && (
            <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
              {crews.length === 0 ? (
                <p className="text-sm text-text-secondary">No {crewPlural.toLowerCase()} available.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {crews.map((c) => {
                    const active = selectedCrewIds.includes(c.id);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => toggleCrew(c.id)}
                        className={`text-left rounded-md border px-3 py-2 transition-colors ${
                          active
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                            : 'border-border-subtle bg-bg-section/20 text-text-secondary hover:bg-bg-section/30'
                        }`}
                      >
                        <p className="text-sm font-medium">{c.displayName}</p>
                        <p className="text-[11px] opacity-80">
                          {roleLabels.get(String(c.role)) ?? String(c.role)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button onClick={create} disabled={!canCreate}>
            {creating ? 'Creating...' : 'Create announcement'}
          </Button>
        </div>
      </Card>

      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary">No {announcementLabelLower}s yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id} className={a.priority === 'urgent' && !a.acknowledgedAt ? 'ring-1 ring-red-500/25' : ''}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary">{a.title}</p>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        a.priority === 'urgent'
                          ? 'text-red-300 bg-red-500/10 border-red-500/20'
                          : 'text-text-tertiary bg-bg-section/30 border-border-subtle'
                      }`}
                    >
                      {a.priority === 'urgent' ? 'Urgent' : 'Normal'}
                    </span>
                    {a.acknowledgedAt && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border text-emerald-300 bg-emerald-500/10 border-emerald-500/20">
                        Acknowledged
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">{formatTs(a.createdAt)}</p>
                </div>

                {a.priority === 'urgent' && !a.acknowledgedAt && (
                  <Button
                    variant="secondary"
                    onClick={() => acknowledge(a.id)}
                    disabled={ackLoadingId === a.id}
                  >
                    {ackLoadingId === a.id ? 'Acknowledging...' : 'Acknowledge'}
                  </Button>
                )}
              </div>

              <p className="text-sm text-text-secondary mt-3 whitespace-pre-wrap">{a.message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
