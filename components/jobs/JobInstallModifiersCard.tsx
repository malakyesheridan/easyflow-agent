'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';

type ModifierRow = {
  id: string;
  name: string;
  description: string | null;
  multiplier: string;
  enabled: boolean;
  jobEnabled: boolean;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

const getApiErrorMessage = (payload: ApiResponse<any>): string | undefined => {
  if (payload.ok) return undefined;
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message;
};

export default function JobInstallModifiersCard({ orgId, jobId }: { orgId: string; jobId: string }) {
  const [modifiers, setModifiers] = useState<ModifierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-install-modifiers?orgId=${orgId}&jobId=${jobId}`);
      const json = (await res.json()) as ApiResponse<any[]>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to load modifiers');

      const rows = (json.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        description: row.description ?? null,
        multiplier: String(row.multiplier ?? ''),
        enabled: Boolean(row.enabled),
        jobEnabled: Boolean(row.jobEnabled),
      }));

      setModifiers(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load modifiers');
      setModifiers([]);
    } finally {
      setLoading(false);
    }
  }, [jobId, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleModifier = (id: string) => {
    setModifiers((prev) =>
      prev.map((row) => (row.id === id ? { ...row, jobEnabled: !row.jobEnabled } : row))
    );
  };

  const selectedCount = useMemo(() => modifiers.filter((m) => m.jobEnabled && m.enabled).length, [modifiers]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/job-install-modifiers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          jobId,
          modifiers: modifiers.map((m) => ({ modifierId: m.id, enabled: m.jobEnabled })),
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to save modifiers');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save modifiers');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Install complexity</h2>
          <p className="text-xs text-text-tertiary mt-1">Toggle modifiers that affect install duration estimates.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={load} disabled={saving || loading}>
            Refresh
          </Button>
          <Button type="button" onClick={save} disabled={saving || loading}>
            {saving ? 'Saving...' : `Save (${selectedCount})`}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-text-secondary">Loading modifiers...</p>
      ) : modifiers.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">No modifiers available yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3">
          {modifiers.map((mod) => (
            <div key={mod.id} className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {mod.name} <span className="text-text-tertiary">x{mod.multiplier}</span>
                  </p>
                  <p className="text-xs text-text-tertiary">{mod.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!mod.enabled && (
                    <span className="text-xs text-text-tertiary">Disabled globally</span>
                  )}
                  <Chip active={mod.jobEnabled} onClick={() => toggleModifier(mod.id)}>
                    {mod.jobEnabled ? 'On' : 'Off'}
                  </Chip>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
