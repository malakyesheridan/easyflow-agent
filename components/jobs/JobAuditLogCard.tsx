'use client';

import { useCallback, useEffect, useState } from 'react';
import { CollapsibleSection, Button } from '@/components/ui';

type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorType: string;
  createdAt: string;
};

type AuditLogDetail = AuditLogRow & {
  before: any;
  after: any;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

function formatActor(row: AuditLogRow): string {
  if (row.actorType !== 'user') return row.actorType;
  return row.actorName || row.actorEmail || 'Unknown';
}

function stringify(value: any): string {
  if (value === null || value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return 'Never';
  const now = new Date();
  const updated = date instanceof Date ? date : new Date(date);
  const diffMs = now.getTime() - updated.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return updated.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function JobAuditLogCard({ orgId, jobId }: { orgId: string; jobId: string }) {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, AuditLogDetail>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/audit-logs?orgId=${orgId}&entityType=job&entityId=${jobId}&limit=50`
      );
      const json = (await res.json()) as ApiResponse<{ rows: AuditLogRow[] }>;
      if (res.ok && json.ok) {
        setRows(json.data.rows ?? []);
      } else {
        setRows([]);
      }
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (detailCache[id]) return;
    try {
      const res = await fetch(`/api/audit-logs/${id}?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<AuditLogDetail>;
      if (res.ok && json.ok) {
        setDetailCache((prev) => ({ ...prev, [id]: json.data }));
      }
    } catch {
      // ignore
    }
  };

  const latestUpdate = rows.reduce<string | null>((latest, row) => {
    if (!latest) return row.createdAt;
    return new Date(row.createdAt).getTime() > new Date(latest).getTime() ? row.createdAt : latest;
  }, null);
  const summary = loading ? 'Loading audit trail...' : `Last update: ${formatRelativeTime(latestUpdate)}`;

  return (
    <CollapsibleSection
      title="Audit trail"
      description="All changes to this job across schedule, status, and data."
      summary={summary}
      defaultOpen={false}
      storageKey={`job-detail-${jobId}-audit`}
      actions={
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          Refresh
        </Button>
      }
    >

      {loading ? (
        <p className="text-sm text-text-secondary mt-4">Loading audit events...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-secondary mt-4">No audit events yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="border border-border-subtle rounded-md bg-bg-section/30">
              <button
                type="button"
                onClick={() => void toggleExpand(row.id)}
                className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-bg-section/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{row.action.replace(/_/g, ' ')}</p>
                  <p className="text-[11px] text-text-tertiary">{new Date(row.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-xs text-text-tertiary">{formatActor(row)}</p>
              </button>
              {expandedId === row.id && detailCache[row.id] && (
                <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-text-tertiary uppercase tracking-wide mb-1">Before</p>
                    <pre className="text-xs text-text-secondary bg-bg-card border border-border-subtle rounded-md p-2 overflow-auto">
                      {stringify(detailCache[row.id].before)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-tertiary uppercase tracking-wide mb-1">After</p>
                    <pre className="text-xs text-text-secondary bg-bg-card border border-border-subtle rounded-md p-2 overflow-auto">
                      {stringify(detailCache[row.id].after)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
