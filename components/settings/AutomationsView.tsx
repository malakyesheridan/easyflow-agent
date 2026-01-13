'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Chip, Input, Select, Textarea } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';
import { getValueByPath, setValueByPath } from '@/lib/automations/utils';
import type { AutomationActionNode, AutomationTemplate, RecipientReference } from '@/lib/automations/types';
import { Bell, Mail, MessageSquare, Settings } from 'lucide-react';
import AutomationsBuilderSection from '@/components/settings/AutomationsBuilderSection';
import RunsTable from '@/components/settings/RunsTable';
import type { CustomAutomationRule } from '@/components/settings/automation-builder/types';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type AutomationRunRow = {
  id: string;
  orgId: string;
  ruleId: string;
  eventId: string;
  entityType: string | null;
  entityId: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  logs: any;
  error: string | null;
  snapshot: any;
  createdAt: string;
};

type AutomationRuleRow = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  templateKey: string | null;
  isEnabled: boolean;
  triggerType: string;
  triggerFilters: Record<string, unknown>;
  conditions: any[];
  actions: AutomationActionNode[];
  throttle: any | null;
  createdAt: string;
  updatedAt: string;
  lastRun?: AutomationRunRow | null;
};

type AutomationActionOutboxRow = {
  id: string;
  actionType: string;
  actionKey: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  actionPayload: any;
  createdAt: string;
  updatedAt: string;
};

type AutomationRunDetail = {
  run: AutomationRunRow;
  actions: AutomationActionOutboxRow[];
};

type SessionPayload = {
  actor?: { capabilities?: string[] } | null;
};

type RuleDraft = {
  name: string;
  description?: string | null;
  templateKey?: string | null;
  isEnabled: boolean;
  triggerType: string;
  triggerFilters: Record<string, unknown>;
  conditions: any[];
  actions: AutomationActionNode[];
  throttle?: any | null;
};

type EditorState = {
  mode: 'create' | 'edit' | 'clone';
  template: AutomationTemplate | null;
  ruleId?: string;
};

const RECIPIENT_OPTIONS = [
  { value: 'job.client', label: 'Job client' },
  { value: 'job.site_contacts', label: 'Job site contacts' },
  { value: 'crew.assigned', label: 'Assigned crew' },
  { value: 'org.admins', label: 'Admins and managers' },
  { value: 'org.staff', label: 'All staff' },
];

const CATEGORY_LABELS: Record<string, string> = {
  communications: 'Communications',
  operations: 'Operations',
  materials: 'Materials',
  progress: 'Progress',
  safety: 'Safety',
};

const runStatusMeta: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-bg-section/80 text-text-tertiary' },
  running: { label: 'Running', className: 'bg-amber-500/10 text-amber-300' },
  success: { label: 'Success', className: 'bg-emerald-500/10 text-emerald-300' },
  partial: { label: 'Partial', className: 'bg-amber-500/10 text-amber-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
  skipped: { label: 'Skipped', className: 'bg-bg-section/80 text-text-tertiary' },
};

const outboxStatusMeta: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-bg-section/80 text-text-tertiary' },
  retrying: { label: 'Retrying', className: 'bg-amber-500/10 text-amber-300' },
  sent: { label: 'Sent', className: 'bg-emerald-500/10 text-emerald-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
  dead: { label: 'Dead', className: 'bg-red-500/10 text-red-300' },
};

function canManageAutomations(payload: SessionPayload | null): boolean {
  const capabilities = payload?.actor?.capabilities ?? [];
  return capabilities.includes('admin') || capabilities.includes('manage_org');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDraftFromTemplate(template: AutomationTemplate): RuleDraft {
  return {
    name: template.name,
    description: template.description,
    templateKey: template.key,
    isEnabled: true,
    triggerType: template.triggerType,
    triggerFilters: cloneJson(template.triggerFilters ?? {}),
    conditions: cloneJson(template.conditions ?? []),
    actions: cloneJson(template.actions ?? []),
    throttle: null,
  };
}

function buildDraftFromRule(rule: AutomationRuleRow): RuleDraft {
  return {
    name: rule.name,
    description: rule.description ?? null,
    templateKey: rule.templateKey ?? null,
    isEnabled: rule.isEnabled ?? false,
    triggerType: rule.triggerType,
    triggerFilters: cloneJson(rule.triggerFilters ?? {}),
    conditions: cloneJson(rule.conditions ?? []),
    actions: cloneJson(rule.actions ?? []),
    throttle: cloneJson(rule.throttle ?? null),
  };
}

function applyConfigDefaults(template: AutomationTemplate, draft: RuleDraft): RuleDraft {
  let next = draft;
  for (const field of template.configSchema ?? []) {
    if (field.defaultValue === undefined) continue;
    const current = getValueByPath(next as Record<string, unknown>, field.path);
    if (current === undefined || current === null || current === '') {
      next = setValueByPath(next as Record<string, unknown>, field.path, field.defaultValue) as RuleDraft;
    }
  }
  return next;
}

function getTemplateChannels(actions: AutomationActionNode[]) {
  const channels = new Set<string>();
  for (const action of actions) {
    if (action.type === 'comms.send') {
      channels.add(action.params.channel);
      continue;
    }
    if (action.type === 'notification.create') {
      channels.add('in_app');
      continue;
    }
    channels.add('ops');
  }
  return Array.from(channels);
}

function getComplexity(actions: AutomationActionNode[], conditions?: any[]): { label: string; variant: 'default' | 'gold' | 'muted' } {
  const score = (conditions?.length ?? 0) + (actions?.length ?? 0);
  if (score <= 2) return { label: 'Simple', variant: 'muted' };
  if (score <= 4) return { label: 'Multi-step', variant: 'default' };
  return { label: 'Advanced', variant: 'gold' };
}

function mapRecipients(value: unknown): RecipientReference[] {
  return Array.isArray(value) ? (value as RecipientReference[]) : [];
}

export default function AutomationsView({ orgId }: { orgId: string }) {
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [rules, setRules] = useState<AutomationRuleRow[]>([]);
  const [customRules, setCustomRules] = useState<CustomAutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [editorTab, setEditorTab] = useState<'config' | 'advanced'>('config');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [runFilters, setRunFilters] = useState({ ruleId: '', status: '', eventId: '' });
  const [runsLoading, setRunsLoading] = useState(false);
  const [runHistoryTab, setRunHistoryTab] = useState<'templates' | 'custom'>('templates');
  const [runDetailId, setRunDetailId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<AutomationRunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [retryingOutboxId, setRetryingOutboxId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const templatesByKey = useMemo(() => new Map(templates.map((template) => [template.key, template])), [templates]);

  const rulesByTemplateKey = useMemo(() => {
    const map = new Map<string, AutomationRuleRow[]>();
    for (const rule of rules) {
      if (!rule.templateKey) continue;
      const list = map.get(rule.templateKey) ?? [];
      list.push(rule);
      map.set(rule.templateKey, list);
    }
    return map;
  }, [rules]);

  const rulesById = useMemo(() => {
    const map = new Map<string, AutomationRuleRow>();
    for (const rule of rules) map.set(rule.id, rule);
    return map;
  }, [rules]);

  const filteredRules = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rules;
    return rules.filter((rule) => {
      const template = rule.templateKey ? templatesByKey.get(rule.templateKey) : null;
      return (
        rule.name.toLowerCase().includes(term) ||
        (rule.description ?? '').toLowerCase().includes(term) ||
        (template?.name?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [rules, search, templatesByKey]);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await fetch('/api/auth/session');
      const json = (await res.json()) as ApiResponse<SessionPayload>;
      if (!res.ok || !json.ok) {
        setCanManage(false);
        setIsAdmin(false);
        return;
      }
      const canManageAutomationsValue = canManageAutomations(json.data);
      setCanManage(canManageAutomationsValue);
      setIsAdmin(Boolean(json.data.actor?.capabilities?.includes('admin')));
    } catch {
      setCanManage(false);
      setIsAdmin(false);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/templates?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<AutomationTemplate[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load templates');
      setTemplates(json.data ?? []);
    } catch (err) {
      setTemplates([]);
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    }
  }, [orgId]);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/rules?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<AutomationRuleRow[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load rules');
      setRules(json.data ?? []);
    } catch (err) {
      setRules([]);
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    }
  }, [orgId]);

  const loadCustomRules = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/rules?orgId=${orgId}&mode=custom`);
      const json = (await res.json()) as ApiResponse<CustomAutomationRule[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load custom rules');
      setCustomRules(json.data ?? []);
    } catch (err) {
      setCustomRules([]);
      setError(err instanceof Error ? err.message : 'Failed to load custom rules');
    }
  }, [orgId]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const params = new URLSearchParams({ orgId, limit: '50' });
      if (runFilters.ruleId) params.set('ruleId', runFilters.ruleId);
      if (runFilters.status) params.set('status', runFilters.status);
      if (runFilters.eventId) params.set('eventId', runFilters.eventId);
      const res = await fetch(`/api/automations/runs?${params.toString()}`);
      const json = (await res.json()) as ApiResponse<AutomationRunRow[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load runs');
      setRuns(json.data ?? []);
    } catch (err) {
      setRuns([]);
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setRunsLoading(false);
    }
  }, [orgId, runFilters.eventId, runFilters.ruleId, runFilters.status]);

  const loadRunDetail = useCallback(
    async (runId: string) => {
      setRunDetailLoading(true);
      try {
        const res = await fetch(`/api/automations/runs/${runId}?orgId=${orgId}`);
        const json = (await res.json()) as ApiResponse<AutomationRunDetail>;
        if (!res.ok || !json.ok) throw new Error('Failed to load run details');
        setRunDetail(json.data);
      } catch (err) {
        setRunDetail(null);
        setError(err instanceof Error ? err.message : 'Failed to load run details');
      } finally {
        setRunDetailLoading(false);
      }
    },
    [orgId]
  );

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!sessionLoading && canManage) {
      setLoading(true);
      setError(null);
      const tasks = [loadTemplates(), loadRules()];
      if (isAdmin) tasks.push(loadCustomRules());
      Promise.all(tasks)
        .catch(() => null)
        .finally(() => setLoading(false));
    }
  }, [canManage, isAdmin, loadCustomRules, loadRules, loadTemplates, sessionLoading]);

  useEffect(() => {
    if (!sessionLoading && canManage) {
      void loadRuns();
    }
  }, [canManage, loadRuns, sessionLoading]);

  useEffect(() => {
    if (!isAdmin && runHistoryTab === 'custom') {
      setRunHistoryTab('templates');
    }
  }, [isAdmin, runHistoryTab]);

  useEffect(() => {
    if (!runDetailId) {
      setRunDetail(null);
      return;
    }
    void loadRunDetail(runDetailId);
  }, [loadRunDetail, runDetailId]);

  const closeEditor = () => {
    setEditor(null);
    setDraft(null);
    setEditorError(null);
    setEditorTab('config');
  };

  const editorSwipe = useSwipeToClose(() => {
    if (!saving) closeEditor();
  }, isMobile);
  const runDetailSwipe = useSwipeToClose(() => setRunDetailId(null), isMobile);

  const openTemplateEditor = (template: AutomationTemplate) => {
    let nextDraft = buildDraftFromTemplate(template);
    nextDraft = applyConfigDefaults(template, nextDraft);
    setEditor({ mode: 'create', template });
    setDraft(nextDraft);
    setEditorTab(template.configSchema.length > 0 ? 'config' : 'advanced');
    setEditorError(null);
  };

  const openRuleEditor = (rule: AutomationRuleRow) => {
    const template = rule.templateKey ? templatesByKey.get(rule.templateKey) ?? null : null;
    let nextDraft = buildDraftFromRule(rule);
    if (template) nextDraft = applyConfigDefaults(template, nextDraft);
    setEditor({ mode: 'edit', template, ruleId: rule.id });
    setDraft(nextDraft);
    setEditorTab(template?.configSchema.length ? 'config' : 'advanced');
    setEditorError(null);
  };

  const openCloneEditor = (rule: AutomationRuleRow) => {
    const template = rule.templateKey ? templatesByKey.get(rule.templateKey) ?? null : null;
    let nextDraft = buildDraftFromRule(rule);
    nextDraft.name = `Copy of ${rule.name}`;
    nextDraft.isEnabled = false;
    if (template) nextDraft = applyConfigDefaults(template, nextDraft);
    setEditor({ mode: 'clone', template });
    setDraft(nextDraft);
    setEditorTab(template?.configSchema.length ? 'config' : 'advanced');
    setEditorError(null);
  };

  const updateDraftPath = (path: string, value: unknown) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return setValueByPath(prev as Record<string, unknown>, path, value) as RuleDraft;
    });
  };

  const saveRule = async () => {
    if (!draft || !editor) return;
    if (!draft.name.trim()) {
      setEditorError('Rule name is required.');
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const payload = {
        orgId,
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        templateKey: draft.templateKey ?? null,
        isEnabled: draft.isEnabled,
        triggerType: draft.triggerType,
        triggerFilters: draft.triggerFilters ?? {},
        conditions: draft.conditions ?? [],
        actions: draft.actions ?? [],
        throttle: draft.throttle ?? null,
      };

      const res =
        editor.mode === 'edit' && editor.ruleId
          ? await fetch(`/api/automations/rules/${editor.ruleId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await fetch('/api/automations/rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

      const json = (await res.json()) as ApiResponse<AutomationRuleRow>;
      if (!res.ok || !json.ok) throw new Error('Failed to save automation');
      await loadRules();
      closeEditor();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Failed to save automation');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: AutomationRuleRow) => {
    setBusyRuleId(rule.id);
    setError(null);
    try {
      const res = await fetch(`/api/automations/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          isEnabled: !rule.isEnabled,
        }),
      });
      const json = (await res.json()) as ApiResponse<AutomationRuleRow>;
      if (!res.ok || !json.ok) throw new Error('Failed to update automation');
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update automation');
    } finally {
      setBusyRuleId(null);
    }
  };

  const deleteRule = async (rule: AutomationRuleRow) => {
    if (!confirm(`Delete automation "${rule.name}"?`)) return;
    setBusyRuleId(rule.id);
    setError(null);
    try {
      const res = await fetch(`/api/automations/rules/${rule.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const json = (await res.json()) as ApiResponse<{ id: string }>;
      if (!res.ok || !json.ok) throw new Error('Failed to delete automation');
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete automation');
    } finally {
      setBusyRuleId(null);
    }
  };

  const retryOutbox = async (outboxId: string) => {
    setRetryingOutboxId(outboxId);
    setError(null);
    try {
      const res = await fetch('/api/automations/actions/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, outboxId }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) throw new Error('Failed to retry action');
      if (runDetailId) await loadRunDetail(runDetailId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry action');
    } finally {
      setRetryingOutboxId(null);
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-4 w-40 rounded bg-bg-section/80" />
            <div className="mt-4 h-10 w-full rounded bg-bg-section/80" />
            <div className="mt-3 h-10 w-full rounded bg-bg-section/80" />
          </Card>
        ))}
      </div>
    );
  }

  if (!canManage) {
    return (
      <Card>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Automations</h2>
          <p className="text-xs text-text-tertiary mt-1">You do not have permission to manage automations.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Templates gallery</h2>
            <p className="text-xs text-text-tertiary mt-1">Start with a template, then tailor the details.</p>
          </div>
          <Button variant="secondary" onClick={() => void loadTemplates()} disabled={saving}>
            Refresh
          </Button>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-text-secondary mt-4">No templates available.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map((template) => {
              const matches = rulesByTemplateKey.get(template.key) ?? [];
              const channels = getTemplateChannels(template.actions ?? []);
              const complexity = getComplexity(template.actions ?? [], template.conditions ?? []);
              return (
                <Card key={template.key} className="bg-bg-section/30 border border-border-subtle">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-text-primary">{template.name}</p>
                      <p className="text-xs text-text-tertiary mt-1">{template.description}</p>
                    </div>
                    <Badge variant="muted">{CATEGORY_LABELS[template.category] ?? template.category}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    <span>Trigger: {template.triggerType}</span>
                    <Badge variant={complexity.variant}>{complexity.label}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    {channels.map((channel) => {
                      const meta =
                        channel === 'email'
                          ? { label: 'Email', Icon: Mail }
                          : channel === 'sms'
                            ? { label: 'SMS', Icon: MessageSquare }
                            : channel === 'in_app'
                              ? { label: 'In-app', Icon: Bell }
                              : { label: 'Ops', Icon: Settings };
                      return (
                        <span key={channel} className="inline-flex items-center gap-1">
                          <meta.Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {matches.length === 0 ? (
                      <Button size="sm" variant="primary" onClick={() => openTemplateEditor(template)} disabled={saving}>
                        Enable template
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => openRuleEditor(matches[0])}>
                          Configure
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openTemplateEditor(template)} disabled={saving}>
                          Add another
                        </Button>
                      </>
                    )}
                    <span className="text-xs text-text-tertiary">
                      {matches.length > 0 ? `${matches.length} active` : 'Not enabled yet'}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      {isAdmin ? (
        <AutomationsBuilderSection orgId={orgId} rules={customRules} onRefresh={loadCustomRules} />
      ) : (
        <Card>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Custom automations (MVP)</h2>
            <p className="text-xs text-text-tertiary mt-1">Admin access is required to manage custom automations.</p>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">My automations</h2>
            <p className="text-xs text-text-tertiary mt-1">Enable, clone, and tune your automations.</p>
          </div>
          <Input
            placeholder="Search automations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {filteredRules.length === 0 ? (
          <p className="text-sm text-text-secondary mt-4">No automations yet. Enable a template to get started.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredRules.map((rule) => {
              const template = rule.templateKey ? templatesByKey.get(rule.templateKey) ?? null : null;
              const lastRun = rule.lastRun ?? null;
              const statusMeta = lastRun ? runStatusMeta[lastRun.status] : null;
              const actionCount = rule.actions?.length ?? 0;
              const canToggle = busyRuleId !== rule.id;
              return (
                <div key={rule.id} className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{rule.name}</p>
                      <p className="text-xs text-text-tertiary mt-1">
                        {rule.description ?? template?.description ?? 'No description'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip active={rule.isEnabled} onClick={canToggle ? () => void toggleRule(rule) : undefined}>
                        {rule.isEnabled ? 'Enabled' : 'Disabled'}
                      </Chip>
                      <Button size="sm" variant="secondary" onClick={() => openRuleEditor(rule)} disabled={!canToggle}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openCloneEditor(rule)} disabled={!canToggle}>
                        Clone
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void deleteRule(rule)} disabled={!canToggle}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                    <span>Trigger: {rule.triggerType}</span>
                    <span>{actionCount} actions</span>
                    {template ? <span>Template: {template.name}</span> : <span>Custom rule</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    <span>Last run:</span>
                    <span className="text-text-secondary">{lastRun ? formatDate(lastRun.createdAt) : 'Never'}</span>
                    {statusMeta && <Badge className={statusMeta.className}>{statusMeta.label}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={runHistoryTab === 'templates'} onClick={() => setRunHistoryTab('templates')}>
            Template runs
          </Chip>
          {isAdmin && (
            <Chip active={runHistoryTab === 'custom'} onClick={() => setRunHistoryTab('custom')}>
              Custom runs
            </Chip>
          )}
        </div>

        {runHistoryTab === 'custom' && isAdmin ? (
          <RunsTable orgId={orgId} rules={customRules} />
        ) : (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Run history</h2>
                <p className="text-xs text-text-tertiary mt-1">Track each automation run and failures.</p>
              </div>
              <Button variant="secondary" onClick={() => void loadRuns()} disabled={runsLoading}>
                Refresh
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select
                label="Rule"
                value={runFilters.ruleId}
                onChange={(e) => setRunFilters((prev) => ({ ...prev, ruleId: e.target.value }))}
              >
                <option value="">All rules</option>
                {rules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Status"
                value={runFilters.status}
                onChange={(e) => setRunFilters((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All statuses</option>
                {Object.keys(runStatusMeta).map((status) => (
                  <option key={status} value={status}>
                    {runStatusMeta[status].label}
                  </option>
                ))}
              </Select>
              <Input
                label="Event ID"
                value={runFilters.eventId}
                onChange={(e) => setRunFilters((prev) => ({ ...prev, eventId: e.target.value }))}
                placeholder="Search by event ID"
              />
            </div>

            <div className="mt-4 space-y-2">
              {runsLoading ? (
                <p className="text-sm text-text-secondary">Loading runs...</p>
              ) : runs.length === 0 ? (
                <p className="text-sm text-text-secondary">No runs yet.</p>
              ) : (
                runs.map((run) => {
                  const rule = rulesById.get(run.ruleId);
                  const meta = runStatusMeta[run.status] ?? runStatusMeta.queued;
                  const actionCount = rule?.actions?.length ?? 0;
                  return (
                    <button
                      key={run.id}
                      type="button"
                      className={cn(
                        'w-full text-left rounded-md border px-3 py-2 transition',
                        runDetailId === run.id
                          ? 'border-accent-gold bg-accent-gold/10 text-text-primary'
                          : 'border-border-subtle bg-bg-section/30 text-text-secondary'
                      )}
                      onClick={() => setRunDetailId(run.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{rule?.name ?? 'Automation rule'}</span>
                        <Badge className={meta.className}>{meta.label}</Badge>
                      </div>
                      <div className="text-xs text-text-tertiary mt-1">
                        {formatDate(run.createdAt)} - {actionCount} actions
                      </div>
                      {run.error && <div className="text-xs text-red-400 mt-1">{run.error}</div>}
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        )}
      </div>

      {editor && draft && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={closeEditor} />
          <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
            <Card
              className={cn(
                'w-full bg-bg-base border border-border-subtle',
                isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-2xl'
              )}
              {...editorSwipe}
            >
              <div className="p-4 md:p-6 space-y-4">
                {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">
                      {editor.mode === 'edit'
                        ? 'Edit automation'
                        : editor.mode === 'clone'
                          ? 'Clone automation'
                          : 'Enable automation'}
                    </h3>
                    <p className="text-xs text-text-tertiary mt-1">
                      {editor.template?.name ?? 'Custom automation'}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={closeEditor} disabled={saving}>
                    Close
                  </Button>
                </div>

                {editorError && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                    {editorError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Rule name"
                    value={draft.name}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                    disabled={saving}
                  />
                  <Input
                    label="Description"
                    value={draft.description ?? ''}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Chip
                    active={draft.isEnabled}
                    onClick={saving ? undefined : () => setDraft((prev) => (prev ? { ...prev, isEnabled: !prev.isEnabled } : prev))}
                  >
                    {draft.isEnabled ? 'Enabled' : 'Disabled'}
                  </Chip>
                  <Button
                    variant={editorTab === 'config' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setEditorTab('config')}
                  >
                    Config
                  </Button>
                  <Button
                    variant={editorTab === 'advanced' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setEditorTab('advanced')}
                  >
                    Advanced
                  </Button>
                </div>

                {editorTab === 'config' ? (
                  <>
                    {editor.template?.configSchema?.length ? (
                      <div className="space-y-3">
                        {editor.template.configSchema.map((field) => {
                          const currentValue = getValueByPath(draft as Record<string, unknown>, field.path);
                          if (field.type === 'text') {
                            return (
                              <div key={field.key}>
                                <Input
                                  label={field.label}
                                  value={typeof currentValue === 'string' ? currentValue : ''}
                                  onChange={(e) => updateDraftPath(field.path, e.target.value)}
                                />
                                {field.helperText && (
                                  <p className="text-xs text-text-tertiary mt-1">{field.helperText}</p>
                                )}
                              </div>
                            );
                          }
                          if (field.type === 'number') {
                            const display =
                              typeof currentValue === 'number'
                                ? String(currentValue)
                                : currentValue === null || currentValue === undefined
                                  ? ''
                                  : String(currentValue);
                            return (
                              <div key={field.key}>
                                <Input
                                  label={field.label}
                                  value={display}
                                  inputMode="decimal"
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    if (!raw) {
                                      updateDraftPath(field.path, null);
                                      return;
                                    }
                                    const next = Number(raw);
                                    if (!Number.isFinite(next)) return;
                                    updateDraftPath(field.path, next);
                                  }}
                                />
                                {field.helperText && (
                                  <p className="text-xs text-text-tertiary mt-1">{field.helperText}</p>
                                )}
                              </div>
                            );
                          }
                          if (field.type === 'select') {
                            return (
                              <div key={field.key}>
                                <Select
                                  label={field.label}
                                  value={typeof currentValue === 'string' ? currentValue : ''}
                                  onChange={(e) => updateDraftPath(field.path, e.target.value)}
                                >
                                  {(field.options ?? []).map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                                {field.helperText && (
                                  <p className="text-xs text-text-tertiary mt-1">{field.helperText}</p>
                                )}
                              </div>
                            );
                          }
                          if (field.type === 'toggle') {
                            const checked = Boolean(currentValue);
                            return (
                              <div key={field.key} className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-text-primary">{field.label}</p>
                                  {field.helperText && (
                                    <p className="text-xs text-text-tertiary mt-1">{field.helperText}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Chip active={checked} onClick={() => updateDraftPath(field.path, true)}>
                                    On
                                  </Chip>
                                  <Chip active={!checked} onClick={() => updateDraftPath(field.path, false)}>
                                    Off
                                  </Chip>
                                </div>
                              </div>
                            );
                          }
                          if (field.type === 'recipients') {
                            const recipients = mapRecipients(currentValue);
                            const refSet = new Set(
                              recipients.filter((item) => item.type === 'ref').map((item) => item.ref)
                            );
                            const preserved = recipients.filter((item) => item.type !== 'ref');
                            const toggleRef = (ref: string) => {
                              const nextRefs = new Set(refSet);
                              if (nextRefs.has(ref)) nextRefs.delete(ref);
                              else nextRefs.add(ref);
                              const nextRecipients: RecipientReference[] = [
                                ...preserved,
                                ...Array.from(nextRefs).map(
                                  (next): RecipientReference => ({ type: 'ref', ref: next })
                                ),
                              ];
                              updateDraftPath(field.path, nextRecipients);
                            };
                            return (
                              <div key={field.key} className="space-y-2">
                                <p className="text-sm font-medium text-text-primary">{field.label}</p>
                                <div className="flex flex-wrap gap-2">
                                  {RECIPIENT_OPTIONS.map((option) => (
                                    <Chip
                                      key={option.value}
                                      active={refSet.has(option.value)}
                                      onClick={() => toggleRef(option.value)}
                                    >
                                      {option.label}
                                    </Chip>
                                  ))}
                                </div>
                                {preserved.length > 0 && (
                                  <p className="text-xs text-text-tertiary">{preserved.length} custom recipients preserved.</p>
                                )}
                                {field.helperText && (
                                  <p className="text-xs text-text-tertiary">{field.helperText}</p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-border-subtle bg-bg-section/20 p-3 text-sm text-text-secondary">
                        This automation has no editable fields yet. Use the Advanced tab to review the JSON.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <Textarea
                      label="Trigger and conditions"
                      rows={8}
                      value={JSON.stringify(
                        {
                          triggerType: draft.triggerType,
                          triggerFilters: draft.triggerFilters,
                          conditions: draft.conditions,
                        },
                        null,
                        2
                      )}
                      readOnly
                    />
                    <Textarea
                      label="Actions"
                      rows={10}
                      value={JSON.stringify(draft.actions ?? [], null, 2)}
                      readOnly
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={closeEditor} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={() => void saveRule()} disabled={saving}>
                    {saving ? 'Saving...' : 'Save automation'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {runDetailId && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRunDetailId(null)} />
          <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
            <Card
              className={cn(
                'w-full bg-bg-base border border-border-subtle',
                isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-3xl'
              )}
              {...runDetailSwipe}
            >
              <div className="p-4 md:p-6 space-y-4">
                {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">Run details</h3>
                    <p className="text-xs text-text-tertiary mt-1">{runDetail?.run?.id ?? runDetailId}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setRunDetailId(null)} disabled={runDetailLoading}>
                    Close
                  </Button>
                </div>

                {runDetailLoading || !runDetail ? (
                  <p className="text-sm text-text-secondary">Loading run details...</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-text-tertiary">Rule</p>
                        <p className="text-text-primary">{rulesById.get(runDetail.run.ruleId)?.name ?? 'Automation rule'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-tertiary">Status</p>
                        <Badge className={(runStatusMeta[runDetail.run.status] ?? runStatusMeta.queued).className}>
                          {(runStatusMeta[runDetail.run.status] ?? runStatusMeta.queued).label}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-text-tertiary">Event ID</p>
                        <p className="text-text-primary">{runDetail.run.eventId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-tertiary">Entity</p>
                        <p className="text-text-primary">
                          {runDetail.run.entityType ?? '-'} {runDetail.run.entityId ?? ''}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-text-primary mb-2">Actions</p>
                      <div className="space-y-2">
                        {runDetail.actions.length === 0 ? (
                          <p className="text-xs text-text-tertiary">No actions recorded.</p>
                        ) : (
                          runDetail.actions.map((action) => {
                            const meta = outboxStatusMeta[action.status] ?? outboxStatusMeta.queued;
                            return (
                              <div key={action.id} className="rounded-md border border-border-subtle bg-bg-section/20 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium text-text-primary">{action.actionType}</p>
                                    <p className="text-xs text-text-tertiary mt-1">Attempts: {action.attempts ?? 0}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className={meta.className}>{meta.label}</Badge>
                                    {action.status === 'dead' && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => void retryOutbox(action.id)}
                                        disabled={retryingOutboxId === action.id}
                                      >
                                        {retryingOutboxId === action.id ? 'Retrying...' : 'Retry'}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {action.lastError && (
                                  <div className="text-xs text-red-400 mt-2">{action.lastError}</div>
                                )}
                                {action.providerMessageId && (
                                  <div className="text-xs text-text-tertiary mt-1">
                                    Provider ID: {action.providerMessageId}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Textarea
                        label="Event snapshot"
                        rows={8}
                        value={JSON.stringify(runDetail.run.snapshot ?? {}, null, 2)}
                        readOnly
                      />
                      <Textarea
                        label="Evaluation logs"
                        rows={8}
                        value={JSON.stringify(runDetail.run.logs ?? [], null, 2)}
                        readOnly
                      />
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
