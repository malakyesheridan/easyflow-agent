'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

type AuditLogRow = {
  id: string;
  orgId: string;
  actorUserId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: any;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
};

type AuditLogDetail = AuditLogRow & {
  before: any;
  after: any;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

const ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'ASSIGN',
  'UNASSIGN',
  'RESCHEDULE',
  'STOCK_CHANGE',
  'NOTE',
  'PHOTO_UPLOAD',
  'PHOTO_DELETE',
  'NOTIFICATION_SENT',
  'SETTINGS_CHANGE',
  'INTEGRATION_CHANGE',
  'LOGIN',
  'LOGOUT',
  'VIEW',
];

function formatActor(row: AuditLogRow): string {
  if (row.actorType !== 'user') return row.actorType;
  const label = row.actorName || row.actorEmail || row.actorUserId || 'Unknown';
  return label;
}

function formatEntity(row: AuditLogRow): string {
  if (!row.entityId) return row.entityType;
  return `${row.entityType} ${row.entityId.slice(0, 8)}`;
}

function diffKeys(before: any, after: any): string[] {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed: string[] = [];
  keys.forEach((key) => {
    if (JSON.stringify((before as any)[key]) !== JSON.stringify((after as any)[key])) {
      changed.push(key);
    }
  });
  return changed.slice(0, 8);
}

function stringify(value: any): string {
  if (value === null || value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditLogsView({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, AuditLogDetail>>({});

  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actorQuery, setActorQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const entityOptions = useMemo(() => {
    const types = new Set(rows.map((r) => r.entityType));
    return Array.from(types).sort();
  }, [rows]);

  const load = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams();
    params.set('orgId', orgId);
    params.set('limit', '50');
    if (cursor) params.set('cursor', cursor);
    if (entityType) params.set('entityType', entityType);
    if (action) params.set('action', action);
    if (actorQuery.trim()) params.set('actor', actorQuery.trim());
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    const res = await fetch(`/api/audit-logs?${params.toString()}`);
    const json = (await res.json()) as ApiResponse<{ rows: AuditLogRow[]; nextCursor: string | null }>;
    if (!res.ok || !json.ok) {
      const message = !json || json.ok ? 'Failed to load audit logs' : json.error?.message || json.error;
      throw new Error(message);
    }
    return json.data;
  }, [orgId, entityType, action, actorQuery, startDate, endDate]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await load();
      setRows(data.rows);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
      setRows([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await load(nextCursor);
      setRows((prev) => [...prev, ...data.rows]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoadingMore(false);
    }
  };

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

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Audit Logs</h2>
          <p className="text-xs text-text-tertiary mt-1">Every change is captured with before/after snapshots.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entities</option>
          {entityOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {ACTIONS.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <Input
          value={actorQuery}
          onChange={(e) => setActorQuery(e.target.value)}
          placeholder="User (name or email)"
        />
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive mt-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-text-secondary mt-4">Loading audit logs...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-secondary mt-4">No audit events found.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map((row) => {
            const isExpanded = expandedId === row.id;
            const detail = detailCache[row.id];
            const changed = detail ? diffKeys(detail.before, detail.after) : [];
            return (
              <div key={row.id} className="border border-border-subtle rounded-lg bg-bg-section/30">
                <button
                  type="button"
                  onClick={() => void toggleExpand(row.id)}
                  className="w-full text-left px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-bg-section/50 transition-colors"
                >
                  <div className="min-w-[180px]">
                    <p className="text-sm font-medium text-text-primary">{row.action.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-text-tertiary">{new Date(row.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-sm text-text-secondary">{formatEntity(row)}</div>
                  <div className="text-xs text-text-tertiary">{formatActor(row)}</div>
                </button>

                {isExpanded && detail && (
                  <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-text-tertiary mb-2">Before</p>
                      <pre className="text-xs text-text-secondary bg-bg-card border border-border-subtle rounded-md p-3 overflow-auto">
                        {stringify(detail.before)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-text-tertiary mb-2">After</p>
                      <pre className="text-xs text-text-secondary bg-bg-card border border-border-subtle rounded-md p-3 overflow-auto">
                        {stringify(detail.after)}
                      </pre>
                    </div>
                    {changed.length > 0 && (
                      <p className="text-xs text-text-tertiary lg:col-span-2">
                        Changed: {changed.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {nextCursor && (
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </Card>
  );
}
