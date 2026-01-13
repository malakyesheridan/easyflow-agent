'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Chip, Input, Select, Textarea } from '@/components/ui';
import { Boxes, CreditCard, Plug, Receipt } from 'lucide-react';
import { IntegrationProviders, IntegrationRegistry, type IntegrationProvider } from '@/lib/integrations/registry';
import { getMissingRequiredFields } from '@/lib/integrations/validation';
import { defaultRulesByProvider, integrationActionTypes, type IntegrationActionType, type IntegrationRule } from '@/lib/integrations/rules';
import { appEventSchemas, type AppEventType } from '@/lib/integrations/events/types';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type IntegrationRow = {
  id: string;
  orgId: string;
  provider: string;
  displayName: string;
  enabled: boolean;
  status: string;
  lastTestedAt: string | null;
  lastError: string | null;
  rules?: IntegrationRule[] | null;
  createdAt: string;
  updatedAt: string;
};

type SessionPayload = {
  actor?: { capabilities?: string[] } | null;
};

type IntegrationForm = {
  displayName: string;
  mode: 'test' | 'live';
  credentials: Record<string, string>;
};

type IntegrationEventRow = {
  id: string;
  provider: string;
  eventType: string;
  actionType: string;
  status: string;
  error: string | null;
  createdAt: string;
  latencyMs: number | null;
};

type RuleForm = {
  id: string;
  name: string;
  enabled: boolean;
  when: AppEventType;
  actionType: IntegrationActionType;
  paramsText: string;
  conditionsText: string;
};

type ToastState = {
  message: string;
  variant: 'success' | 'error';
};

type ModalState = {
  provider: IntegrationProvider;
  intent: 'connect' | 'edit' | 'test';
};

type OrgSettingsRow = {
  xeroSyncPaymentsEnabled?: boolean | null;
  xeroSalesAccountCode?: string | null;
  xeroTaxType?: string | null;
};

type XeroConnectionInfo = {
  connected: boolean;
  tenantId: string | null;
  tenantName: string | null;
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  status: string | null;
  enabled: boolean;
  hasClientCredentials: boolean;
};

const statusMeta: Record<string, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'bg-emerald-500/10 text-emerald-300' },
  error: { label: 'Error', className: 'bg-red-500/10 text-red-300' },
  disconnected: { label: 'Disconnected', className: 'bg-bg-section/80 text-text-tertiary' },
  disabled: { label: 'Disconnected', className: 'bg-bg-section/80 text-text-tertiary' },
};

const eventStatusMeta: Record<string, { label: string; className: string }> = {
  success: { label: 'Success', className: 'bg-emerald-500/10 text-emerald-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
  queued: { label: 'Queued', className: 'bg-bg-section/80 text-text-tertiary' },
  processing: { label: 'Running', className: 'bg-amber-500/10 text-amber-300' },
};

const categoryIcons = {
  payments: CreditCard,
  inventory: Boxes,
  accounting: Receipt,
  custom: Plug,
} as const;

const iconOverrides: Record<string, typeof Plug> = {
  credit_card: CreditCard,
  inventory: Boxes,
  accounting: Receipt,
  plug: Plug,
};

function toLabel(key: string): string {
  return key
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function isSecretField(key: string): boolean {
  return /(secret|token|key|password)/i.test(key);
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Never tested';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

const eventTypeOptions = Object.keys(appEventSchemas) as AppEventType[];

const actionOptionsByProvider: Record<IntegrationProvider, IntegrationActionType[]> = {
  stripe: ['stripe.create_payment_link', 'stripe.create_deposit_invoice'],
  xero: ['xero.sync_invoice', 'xero.sync_invoice_status', 'xero.create_invoice_draft'],
  inventory_generic: ['inventory.reserve_stock', 'inventory.deduct_stock', 'inventory.sync_levels'],
  custom_api: ['webhook.deliver'],
};

function toRuleForm(rule: IntegrationRule): RuleForm {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    when: rule.when,
    actionType: rule.action.type,
    paramsText: rule.action.params ? JSON.stringify(rule.action.params, null, 2) : '',
    conditionsText: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : '',
  };
}

function buildRuleForms(integrations: IntegrationRow[]): Record<string, RuleForm[]> {
  const map = new Map(integrations.map((row) => [row.provider, row]));
  const forms: Record<string, RuleForm[]> = {};

  for (const provider of IntegrationProviders) {
    const integration = map.get(provider);
    const rules = integration?.rules ?? defaultRulesByProvider[provider] ?? [];
    forms[provider] = rules.map(toRuleForm);
  }

  return forms;
}

function parseJsonField(input: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!input.trim()) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'JSON must be an object.' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Invalid JSON.' };
  }
}

function getProviderFields(entry: typeof IntegrationRegistry[IntegrationProvider]): {
  required: string[];
  optional: string[];
  all: string[];
} {
  const optional = ((entry as { optionalFields?: string[] }).optionalFields ?? []).filter(Boolean);
  const required = entry.requiredFields ?? [];
  return { required, optional, all: [...required, ...optional] };
}

function buildEmptyCredentials(entry: typeof IntegrationRegistry[IntegrationProvider]): Record<string, string> {
  const fields = getProviderFields(entry).all;
  const credentials: Record<string, string> = {};
  for (const field of fields) {
    credentials[field] = '';
  }
  return credentials;
}

function buildInitialForms(integrations: IntegrationRow[]): Record<string, IntegrationForm> {
  const map = new Map(integrations.map((row) => [row.provider, row]));
  const forms: Record<string, IntegrationForm> = {};

  for (const provider of IntegrationProviders) {
    const entry = IntegrationRegistry[provider];
    const integration = map.get(provider);

    forms[provider] = {
      displayName: integration?.displayName ?? entry.name,
      mode: 'live',
      credentials: buildEmptyCredentials(entry),
    };
  }

  return forms;
}

function canManageIntegrations(payload: SessionPayload | null): boolean {
  const capabilities = payload?.actor?.capabilities ?? [];
  return capabilities.includes('admin') || capabilities.includes('manage_org');
}

export default function IntegrationsView({ orgId }: { orgId: string }) {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [forms, setForms] = useState<Record<string, IntegrationForm>>(() => buildInitialForms([]));
  const [ruleForms, setRuleForms] = useState<Record<string, RuleForm[]>>(() => buildRuleForms([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [activityProvider, setActivityProvider] = useState<IntegrationProvider | null>(null);
  const [activityMap, setActivityMap] = useState<Record<string, IntegrationEventRow[]>>({});
  const [activityLoading, setActivityLoading] = useState<Record<string, boolean>>({});
  const [xeroSettings, setXeroSettings] = useState<OrgSettingsRow | null>(null);
  const [xeroConnection, setXeroConnection] = useState<XeroConnectionInfo | null>(null);
  const [xeroSettingsSaving, setXeroSettingsSaving] = useState(false);
  const [xeroSettingsError, setXeroSettingsError] = useState<string | null>(null);
  const [xeroSyncing, setXeroSyncing] = useState(false);

  const integrationMap = useMemo(() => {
    const map = new Map<string, IntegrationRow>();
    for (const row of integrations) {
      map.set(row.provider, row);
    }
    return map;
  }, [integrations]);

  const showToast = useCallback((message: string, variant: ToastState['variant']) => {
    setToast({ message, variant });
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await fetch('/api/auth/session');
      const json = (await res.json()) as ApiResponse<SessionPayload>;
      if (!res.ok || !json.ok) {
        setCanManage(false);
        return;
      }
      setCanManage(canManageIntegrations(json.data));
    } catch (err) {
      console.error('Failed to load session for integrations:', err);
      setCanManage(false);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const loadIntegrations = useCallback(async (preserveProvider?: IntegrationProvider) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<IntegrationRow[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load integrations');

      setIntegrations(json.data ?? []);
      setForms((prev) => {
        const next = buildInitialForms(json.data ?? []);
        if (preserveProvider) {
          next[preserveProvider] = {
            ...next[preserveProvider],
            ...prev[preserveProvider],
          };
        }
        return next;
      });
      setRuleForms((prev) => {
        const next = buildRuleForms(json.data ?? []);
        if (preserveProvider && prev[preserveProvider]) {
          next[preserveProvider] = prev[preserveProvider];
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to load integrations:', err);
      setError('Unable to load integrations.');
      setIntegrations([]);
      setForms(buildInitialForms([]));
      setRuleForms(buildRuleForms([]));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadXeroSettings = useCallback(async () => {
    setXeroSettingsError(null);
    try {
      const res = await fetch(`/api/settings?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<OrgSettingsRow | null>;
      if (!res.ok || !json.ok) {
        throw new Error('Failed to load Xero settings');
      }
      setXeroSettings(json.data ?? null);
    } catch (err) {
      console.error('Failed to load Xero settings:', err);
      setXeroSettingsError('Unable to load Xero settings.');
      setXeroSettings(null);
    }
  }, [orgId]);

  const loadXeroConnection = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/xero/connection?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<XeroConnectionInfo>;
      if (!res.ok || !json.ok) {
        throw new Error('Failed to load Xero connection');
      }
      setXeroConnection(json.data ?? null);
    } catch (err) {
      console.error('Failed to load Xero connection:', err);
      setXeroConnection(null);
    }
  }, [orgId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!sessionLoading && canManage) {
      void loadIntegrations();
      void loadXeroSettings();
      void loadXeroConnection();
    }
  }, [sessionLoading, canManage, loadIntegrations, loadXeroSettings, loadXeroConnection]);

  const openModal = (provider: IntegrationProvider, intent: ModalState['intent']) => {
    const entry = IntegrationRegistry[provider];
    setModalError(null);
    setModal({ provider, intent });
    setForms((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        credentials: buildEmptyCredentials(entry),
      },
    }));
  };

  const closeModal = () => {
    if (modal) {
      const entry = IntegrationRegistry[modal.provider];
      setForms((prev) => ({
        ...prev,
        [modal.provider]: {
          ...prev[modal.provider],
          credentials: buildEmptyCredentials(entry),
        },
      }));
    }
    setModalError(null);
    setModal(null);
  };

  const isModalBusy = Boolean(modal && busyProvider && busyProvider === modal.provider);
  const modalSwipe = useSwipeToClose(() => {
    if (!isModalBusy) closeModal();
  }, isMobile);

  const updateForm = (provider: IntegrationProvider, patch: Partial<IntegrationForm>) => {
    setForms((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        ...patch,
      },
    }));
  };

  const updateCredential = (provider: IntegrationProvider, field: string, value: string) => {
    setForms((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        credentials: {
          ...prev[provider].credentials,
          [field]: value,
        },
      },
    }));
  };

  const updateRuleForm = (provider: IntegrationProvider, ruleId: string, patch: Partial<RuleForm>) => {
    setRuleForms((prev) => ({
      ...prev,
      [provider]: (prev[provider] ?? []).map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    }));
  };

  const addRule = (provider: IntegrationProvider) => {
    const actionOptions = actionOptionsByProvider[provider] ?? integrationActionTypes;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${provider}-rule-${Date.now()}`;
    const nextRule: RuleForm = {
      id,
      name: 'New rule',
      enabled: false,
      when: eventTypeOptions[0],
      actionType: actionOptions[0],
      paramsText: '',
      conditionsText: '',
    };
    setRuleForms((prev) => ({
      ...prev,
      [provider]: [...(prev[provider] ?? []), nextRule],
    }));
  };

  const removeRule = (provider: IntegrationProvider, ruleId: string) => {
    setRuleForms((prev) => ({
      ...prev,
      [provider]: (prev[provider] ?? []).filter((rule) => rule.id !== ruleId),
    }));
  };

  const handleSaveRules = async (provider: IntegrationProvider) => {
    const integration = integrationMap.get(provider);
    if (!integration) {
      setRulesError('Connect the integration before saving rules.');
      return;
    }

    setBusyProvider(provider);
    setRulesError(null);
    const rulesInput = ruleForms[provider] ?? [];
    const rules: IntegrationRule[] = [];

    for (const rule of rulesInput) {
      if (!rule.name.trim()) {
        setRulesError('Rule name is required.');
        setBusyProvider(null);
        return;
      }

      const paramsResult = parseJsonField(rule.paramsText);
      if (!paramsResult.ok) {
        setRulesError(`Rule "${rule.name}": ${paramsResult.error}`);
        setBusyProvider(null);
        return;
      }

      const conditionsResult = parseJsonField(rule.conditionsText);
      if (!conditionsResult.ok) {
        setRulesError(`Rule "${rule.name}": ${conditionsResult.error}`);
        setBusyProvider(null);
        return;
      }

      rules.push({
        id: rule.id,
        name: rule.name.trim(),
        enabled: rule.enabled,
        when: rule.when,
        action: {
          type: rule.actionType,
          params: Object.keys(paramsResult.value).length > 0 ? paramsResult.value : undefined,
        },
        conditions: Object.keys(conditionsResult.value).length > 0 ? conditionsResult.value : undefined,
      });
    }

    try {
      const res = await fetch('/api/integrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: integration.id,
          orgId,
          rules,
        }),
      });
      const json = (await res.json()) as ApiResponse<IntegrationRow>;
      if (!res.ok || !json.ok) throw new Error('Failed to save rules');
      await loadIntegrations(provider);
      showToast('Rules saved.', 'success');
    } catch (err) {
      console.error('Failed to save rules:', err);
      setRulesError('Unable to save rules.');
      showToast('Unable to save rules.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const loadActivity = useCallback(
    async (provider: IntegrationProvider) => {
      setActivityLoading((prev) => ({ ...prev, [provider]: true }));
      try {
        const res = await fetch(`/api/integration-events?orgId=${orgId}&provider=${provider}&limit=20`);
        const json = (await res.json()) as ApiResponse<IntegrationEventRow[]>;
        if (!res.ok || !json.ok) throw new Error('Failed to load activity');
        setActivityMap((prev) => ({ ...prev, [provider]: json.data ?? [] }));
      } catch (err) {
        console.error('Failed to load integration activity:', err);
        setActivityMap((prev) => ({ ...prev, [provider]: [] }));
      } finally {
        setActivityLoading((prev) => ({ ...prev, [provider]: false }));
      }
    },
    [orgId]
  );

  const toggleActivity = (provider: IntegrationProvider) => {
    setActivityProvider((current) => {
      const next = current === provider ? null : provider;
      if (next === provider) {
        void loadActivity(provider);
      }
      return next;
    });
  };

  const retryFailed = async (provider: IntegrationProvider) => {
    setBusyProvider(provider);
    try {
      const res = await fetch('/api/integration-events/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, provider }),
      });
      const json = (await res.json()) as ApiResponse<{ updatedCount: number }>;
      if (!res.ok || !json.ok) throw new Error('Failed to retry');
      await loadActivity(provider);
      showToast('Retry queued.', 'success');
    } catch (err) {
      console.error('Failed to retry integration events:', err);
      showToast('Retry failed.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const saveXeroSettings = async (patch: Partial<OrgSettingsRow>) => {
    setXeroSettingsSaving(true);
    setXeroSettingsError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          ...patch,
        }),
      });
      const json = (await res.json()) as ApiResponse<OrgSettingsRow>;
      if (!res.ok || !json.ok) {
        throw new Error('Failed to save Xero settings');
      }
      setXeroSettings(json.data);
    } catch (err) {
      console.error('Failed to save Xero settings:', err);
      setXeroSettingsError('Unable to save Xero settings.');
    } finally {
      setXeroSettingsSaving(false);
    }
  };

  const handleXeroConnect = () => {
    window.location.href = `/api/integrations/xero/connect?orgId=${orgId}`;
  };

  const handleXeroDisconnect = async () => {
    setBusyProvider('xero');
    try {
      const res = await fetch('/api/integrations/xero/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const json = (await res.json()) as ApiResponse<boolean>;
      if (!res.ok || !json.ok) throw new Error('Failed to disconnect');
      await loadIntegrations();
      await loadXeroConnection();
      showToast('Xero disconnected.', 'success');
    } catch (err) {
      console.error('Failed to disconnect Xero:', err);
      showToast('Unable to disconnect Xero.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const handleXeroTestSync = async () => {
    setXeroSyncing(true);
    try {
      const res = await fetch('/api/integrations/xero/test-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const json = (await res.json()) as ApiResponse<{ integrationEventId: string }>;
      if (!res.ok || !json.ok) throw new Error('Failed to queue test sync');
      await loadActivity('xero');
      showToast('Test sync queued.', 'success');
    } catch (err) {
      console.error('Failed to test Xero sync:', err);
      showToast('Unable to queue test sync.', 'error');
    } finally {
      setXeroSyncing(false);
    }
  };

  const buildCredentialsPayload = (provider: IntegrationProvider, form: IntegrationForm) => {
    const raw = form.credentials ?? {};
    const trimmed: Record<string, string> = {};

    for (const [key, value] of Object.entries(raw)) {
      const next = value?.trim() ?? '';
      if (next) {
        trimmed[key] = next;
      }
    }

    const missing = getMissingRequiredFields(provider, trimmed);
    return { credentials: trimmed, missing };
  };

  const handleSave = async (provider: IntegrationProvider) => {
    const form = forms[provider];
    const { credentials, missing } = buildCredentialsPayload(provider, form);
    if (missing.length > 0) {
      setModalError(`Missing required fields: ${missing.join(', ')}`);
      return;
    }

    setBusyProvider(provider);
    setModalError(null);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          provider,
          displayName: form.displayName.trim() || IntegrationRegistry[provider].name,
          credentials,
          mode: form.mode,
        }),
      });
      const json = (await res.json()) as ApiResponse<IntegrationRow>;
      if (!res.ok || !json.ok) throw new Error('Failed to save integration');
      await loadIntegrations();
      if (provider === 'xero') {
        await loadXeroConnection();
      }
      showToast('Integration credentials saved.', 'success');
      closeModal();
    } catch (err) {
      console.error('Failed to save integration:', err);
      setModalError('Unable to save integration.');
      showToast('Unable to save integration.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const handleTest = async (provider: IntegrationProvider) => {
    const form = forms[provider];
    const { credentials, missing } = buildCredentialsPayload(provider, form);
    if (missing.length > 0) {
      setModalError(`Missing required fields: ${missing.join(', ')}`);
      return;
    }

    setBusyProvider(provider);
    setModalError(null);
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          provider,
          displayName: form.displayName.trim() || IntegrationRegistry[provider].name,
          credentials,
          mode: form.mode,
        }),
      });
      const json = (await res.json()) as ApiResponse<IntegrationRow>;
      if (!res.ok || !json.ok) {
        const message = json.ok ? 'Integration test failed.' : json.error?.message || 'Integration test failed.';
        throw new Error(message);
      }
      await loadIntegrations(provider);
      if (provider === 'xero') {
        await loadXeroConnection();
      }
      showToast('Connection successful.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Integration test failed.';
      setModalError(message);
      showToast(message, 'error');
      await loadIntegrations(provider);
    } finally {
      setBusyProvider(null);
    }
  };

  const handleToggleEnabled = async (provider: IntegrationProvider) => {
    const integration = integrationMap.get(provider);
    if (!integration) return;

    setBusyProvider(provider);
    try {
      const res = await fetch('/api/integrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: integration.id,
          orgId,
          enabled: !integration.enabled,
        }),
      });
      const json = (await res.json()) as ApiResponse<IntegrationRow>;
      if (!res.ok || !json.ok) throw new Error('Failed to update integration');
      await loadIntegrations();
      showToast(integration.enabled ? 'Integration disconnected.' : 'Integration enabled.', 'success');
    } catch (err) {
      console.error('Failed to update integration:', err);
      showToast('Unable to update integration.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDelete = async (provider: IntegrationProvider) => {
    const integration = integrationMap.get(provider);
    if (!integration) return;
    if (!window.confirm(`Remove ${integration.displayName}? This cannot be undone.`)) return;

    setBusyProvider(provider);
    try {
      const res = await fetch('/api/integrations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: integration.id,
          orgId,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ id: string }>;
      if (!res.ok || !json.ok) throw new Error('Failed to delete integration');
      await loadIntegrations();
      if (provider === 'xero') {
        await loadXeroConnection();
      }
      showToast('Integration removed.', 'success');
      closeModal();
    } catch (err) {
      console.error('Failed to delete integration:', err);
      showToast('Unable to remove integration.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  if (sessionLoading) {
    return (
      <div className="space-y-4">
        {IntegrationProviders.map((provider) => (
          <Card key={provider} className="animate-pulse">
            <div className="h-4 w-48 rounded bg-bg-section/80" />
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
          <h2 className="text-lg font-semibold text-text-primary">Integrations</h2>
          <p className="text-xs text-text-tertiary mt-1">You do not have permission to manage integrations.</p>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {IntegrationProviders.map((provider) => (
          <Card key={provider} className="animate-pulse">
            <div className="h-4 w-48 rounded bg-bg-section/80" />
            <div className="mt-4 h-10 w-full rounded bg-bg-section/80" />
            <div className="mt-3 h-10 w-full rounded bg-bg-section/80" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {IntegrationProviders.map((provider) => {
          const entry = IntegrationRegistry[provider];
          const integration = integrationMap.get(provider);
          const statusKey = integration?.status ?? 'disconnected';
          const status = statusMeta[statusKey] ?? statusMeta.disconnected;
          const fields = getProviderFields(entry);
          const iconKey = (entry as { icon?: string }).icon;
          const Icon = (iconKey && iconOverrides[iconKey]) || categoryIcons[entry.category] || Plug;
          const isBusy = busyProvider === provider;
          const canEnable = Boolean(integration) && (statusKey === 'connected' || statusKey === 'disabled');
          const canToggle = integration?.enabled ? true : canEnable;
          const enabledLabel = integration?.enabled ? 'Disconnect' : 'Enable';
          const rulesForProvider = ruleForms[provider] ?? [];
          const actionOptions = actionOptionsByProvider[provider] ?? integrationActionTypes;
          const activityRows = activityMap[provider] ?? [];
          const activityOpen = activityProvider === provider;
          const isXero = provider === 'xero';

          return (
            <Card key={provider} className="bg-bg-section/30 border border-border-subtle">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-md border border-border-subtle bg-bg-base/60 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-text-primary">{entry.name}</h2>
                      <Badge className={status.className}>{status.label}</Badge>
                    </div>
                    <p className="text-xs text-text-tertiary mt-1">{entry.description}</p>
                  </div>
                </div>
                <div className="text-right text-xs text-text-tertiary">
                  <p>Last tested</p>
                  <p className="text-text-secondary">{formatTimestamp(integration?.lastTestedAt ?? null)}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                <span>Supports: {entry.supports.join(', ')}</span>
                {integration?.lastError ? <span className="text-red-400">Error: {integration.lastError}</span> : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {isXero ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openModal(provider, integration ? 'edit' : 'connect')}
                      disabled={isBusy}
                    >
                      {integration ? 'Edit credentials' : 'Add credentials'}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleXeroConnect}
                      disabled={isBusy || !xeroConnection?.hasClientCredentials}
                    >
                      {xeroConnection?.connected ? 'Reconnect' : 'Connect'}
                    </Button>
                    {xeroConnection?.connected && (
                      <Button size="sm" variant="ghost" onClick={() => void handleXeroDisconnect()} disabled={isBusy}>
                        Disconnect
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleXeroTestSync()}
                      disabled={isBusy || !xeroConnection?.connected || xeroSyncing}
                    >
                      {xeroSyncing ? 'Syncing...' : 'Test sync'}
                    </Button>
                    {integration ? (
                      <Button size="sm" variant="ghost" onClick={() => toggleActivity(provider)} disabled={isBusy}>
                        {activityOpen ? 'Hide activity' : 'Activity'}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => openModal(provider, integration ? 'edit' : 'connect')}
                      disabled={isBusy}
                    >
                      {integration ? 'Edit' : 'Connect'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openModal(provider, 'test')} disabled={isBusy}>
                      Test connection
                    </Button>
                    {integration ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleToggleEnabled(provider)}
                        disabled={!canToggle || isBusy}
                      >
                        {enabledLabel}
                      </Button>
                    ) : null}
                    {integration ? (
                      <Button size="sm" variant="ghost" onClick={() => toggleActivity(provider)} disabled={isBusy}>
                        {activityOpen ? 'Hide activity' : 'Activity'}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>

              {activityOpen && (
                <div className="mt-4 rounded-md border border-border-subtle bg-bg-base/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Activity</p>
                      <p className="text-xs text-text-tertiary">Latest integration actions.</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => void retryFailed(provider)} disabled={isBusy}>
                      Retry failed
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {activityLoading[provider] ? (
                      <p className="text-xs text-text-tertiary">Loading activity...</p>
                    ) : activityRows.length === 0 ? (
                      <p className="text-xs text-text-tertiary">No recent activity.</p>
                    ) : (
                      activityRows.map((row) => {
                        const meta = eventStatusMeta[row.status] ?? eventStatusMeta.queued;
                        return (
                          <div key={row.id} className="flex items-start justify-between gap-3 rounded-md border border-border-subtle px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-text-primary">
                                {row.eventType} - {row.actionType}
                              </p>
                              <p className="text-[11px] text-text-tertiary mt-1">
                                {new Date(row.createdAt).toLocaleString()}
                                {row.latencyMs ? ` | ${row.latencyMs}ms` : ''}
                              </p>
                              {row.error ? <p className="text-[11px] text-red-400 mt-1">{row.error}</p> : null}
                            </div>
                            <Badge className={meta.className}>{meta.label}</Badge>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {isXero && (
                <div className="mt-4 rounded-md border border-border-subtle bg-bg-base/60 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Xero settings</p>
                      <p className="text-xs text-text-tertiary">Connection, sync, and defaults.</p>
                    </div>
                    <div className="text-right text-xs text-text-tertiary">
                      <p>Tenant</p>
                      <p className="text-text-secondary">
                        {xeroConnection?.tenantName ?? (xeroConnection?.connected ? 'Connected' : 'Not connected')}
                      </p>
                      <p className="mt-1">Last sync</p>
                      <p className="text-text-secondary">{formatTimestamp(xeroConnection?.lastSyncAt ?? null)}</p>
                    </div>
                  </div>

                  {xeroSettingsError && (
                    <div className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
                      {xeroSettingsError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-section/30 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Sync invoices to Xero</p>
                        <p className="text-xs text-text-tertiary">Push new or updated invoices.</p>
                      </div>
                      <Chip
                        active={Boolean(integration?.enabled)}
                        onClick={
                          integration && xeroConnection?.connected && !isBusy
                            ? () => void handleToggleEnabled('xero')
                            : undefined
                        }
                        className={!integration || !xeroConnection?.connected || isBusy ? 'cursor-not-allowed opacity-60' : undefined}
                      >
                        {integration?.enabled ? 'On' : 'Off'}
                      </Chip>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-section/30 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Sync payment status</p>
                        <p className="text-xs text-text-tertiary">Update paid state from Xero.</p>
                      </div>
                      <Chip
                        active={Boolean(xeroSettings?.xeroSyncPaymentsEnabled)}
                        onClick={
                          xeroConnection?.connected && !xeroSettingsSaving
                            ? () =>
                                void saveXeroSettings({
                                  xeroSyncPaymentsEnabled: !xeroSettings?.xeroSyncPaymentsEnabled,
                                })
                            : undefined
                        }
                        className={!xeroConnection?.connected || xeroSettingsSaving ? 'cursor-not-allowed opacity-60' : undefined}
                      >
                        {xeroSettings?.xeroSyncPaymentsEnabled ? 'On' : 'Off'}
                      </Chip>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      label="Sales account code"
                      value={xeroSettings?.xeroSalesAccountCode ?? ''}
                      onChange={(e) =>
                        setXeroSettings((prev) => ({
                          ...(prev ?? {}),
                          xeroSalesAccountCode: e.target.value,
                        }))
                      }
                      placeholder="e.g. 200"
                      disabled={xeroSettingsSaving}
                    />
                    <Select
                      label="Tax type"
                      value={xeroSettings?.xeroTaxType ?? 'NONE'}
                      onChange={(e) =>
                        setXeroSettings((prev) => ({
                          ...(prev ?? {}),
                          xeroTaxType: e.target.value,
                        }))
                      }
                      disabled={xeroSettingsSaving}
                    >
                      <option value="NONE">No tax (NONE)</option>
                      <option value="OUTPUT">GST on income (OUTPUT)</option>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void saveXeroSettings({
                          xeroSalesAccountCode: xeroSettings?.xeroSalesAccountCode ?? null,
                          xeroTaxType: xeroSettings?.xeroTaxType ?? null,
                        })
                      }
                      disabled={xeroSettingsSaving}
                    >
                      {xeroSettingsSaving ? 'Saving...' : 'Save defaults'}
                    </Button>
                  </div>
                </div>
              )}

              {integration && !isXero && (
                <div className="mt-4 rounded-md border border-border-subtle bg-bg-base/60 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Rules</p>
                      <p className="text-xs text-text-tertiary">Define which events trigger actions.</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => addRule(provider)} disabled={isBusy}>
                      Add rule
                    </Button>
                  </div>

                  {rulesError && (
                    <div className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
                      {rulesError}
                    </div>
                  )}

                  {rulesForProvider.length === 0 ? (
                    <p className="text-xs text-text-tertiary">No rules configured yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {rulesForProvider.map((rule) => (
                        <div key={rule.id} className="rounded-md border border-border-subtle p-3 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <Input
                              label="Rule name"
                              value={rule.name}
                              onChange={(e) => updateRuleForm(provider, rule.id, { name: e.target.value })}
                              disabled={isBusy}
                            />
                            <div className="flex items-center gap-2 pt-6">
                              <Button
                                size="sm"
                                variant={rule.enabled ? 'primary' : 'ghost'}
                                onClick={() => updateRuleForm(provider, rule.id, { enabled: !rule.enabled })}
                                disabled={isBusy}
                              >
                                {rule.enabled ? 'Enabled' : 'Disabled'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeRule(provider, rule.id)}
                                disabled={isBusy}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Select
                              label="When event"
                              value={rule.when}
                              onChange={(e) => updateRuleForm(provider, rule.id, { when: e.target.value as AppEventType })}
                              disabled={isBusy}
                            >
                              {eventTypeOptions.map((eventType) => (
                                <option key={eventType} value={eventType}>
                                  {eventType}
                                </option>
                              ))}
                            </Select>
                            <Select
                              label="Action"
                              value={rule.actionType}
                              onChange={(e) =>
                                updateRuleForm(provider, rule.id, { actionType: e.target.value as IntegrationActionType })
                              }
                              disabled={isBusy}
                            >
                              {actionOptions.map((actionType) => (
                                <option key={actionType} value={actionType}>
                                  {actionType}
                                </option>
                              ))}
                            </Select>
                          </div>

                          <Textarea
                            label="Action params (JSON)"
                            value={rule.paramsText}
                            onChange={(e) => updateRuleForm(provider, rule.id, { paramsText: e.target.value })}
                            placeholder='{"amountCents": 5000, "currency": "AUD"}'
                            disabled={isBusy}
                          />
                          <Textarea
                            label="Conditions (JSON)"
                            value={rule.conditionsText}
                            onChange={(e) => updateRuleForm(provider, rule.id, { conditionsText: e.target.value })}
                            placeholder='{"jobStatusIn": ["completed"]}'
                            disabled={isBusy}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="primary" onClick={() => void handleSaveRules(provider)} disabled={isBusy}>
                      {isBusy ? 'Saving...' : 'Save rules'}
                    </Button>
                  </div>
                </div>
              )}

              {modal?.provider === provider && (
                <div className="fixed inset-0 z-50">
                  <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
                  <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
                    <Card
                      className={cn(
                        'w-full bg-bg-base border border-border-subtle',
                        isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-xl'
                      )}
                      {...modalSwipe}
                    >
                      <div className="p-4 md:p-6 space-y-4">
                        {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-text-primary">
                              {modal.intent === 'edit'
                                ? 'Edit'
                                : modal.intent === 'test'
                                  ? 'Test'
                                  : 'Connect'}{' '}
                              {entry.name}
                            </h3>
                            <p className="text-xs text-text-tertiary mt-1">
                              {modal.intent === 'test'
                                ? 'Enter credentials to test the connection. They are encrypted at rest and never shown again.'
                                : 'Credentials are encrypted at rest and never shown again.'}
                            </p>
                          </div>
                          <Button variant="secondary" size="sm" onClick={closeModal} disabled={isBusy}>
                            Close
                          </Button>
                        </div>

                        {modalError && (
                          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                            {modalError}
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <Input
                            label="Display name"
                            value={forms[provider]?.displayName ?? entry.name}
                            onChange={(e) => updateForm(provider, { displayName: e.target.value })}
                            placeholder={entry.name}
                            disabled={isBusy}
                          />
                          <Select
                            label="Mode"
                            value={forms[provider]?.mode ?? 'live'}
                            onChange={(e) =>
                              updateForm(provider, { mode: e.target.value as IntegrationForm['mode'] })
                            }
                            disabled={isBusy}
                          >
                            <option value="live">Live</option>
                            <option value="test">Test</option>
                          </Select>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {fields.all.map((field) => {
                            const required = fields.required.includes(field);
                            return (
                              <Input
                                key={field}
                                label={`${toLabel(field)}${required ? ' *' : ' (optional)'}`}
                                type={isSecretField(field) ? 'password' : 'text'}
                                value={forms[provider]?.credentials?.[field] ?? ''}
                                onChange={(e) => updateCredential(provider, field, e.target.value)}
                                placeholder={isSecretField(field) ? '********' : ''}
                                disabled={isBusy}
                              />
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleTest(provider)}
                            disabled={isBusy}
                          >
                            {isBusy ? 'Testing...' : 'Test connection'}
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => void handleSave(provider)}
                            disabled={isBusy}
                          >
                            {isBusy ? 'Saving...' : 'Save credentials'}
                          </Button>
                          {integration ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleDelete(provider)}
                              disabled={isBusy}
                            >
                              Remove integration
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {toastVisible && toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 ${
            toast.variant === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/20 bg-red-500/10 text-red-200'
          }`}
        >
          <p className="text-sm">{toast.message}</p>
        </div>
      )}
    </div>
  );
}
