'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Chip } from '@/components/ui';
import RuleCard from '@/components/settings/RuleCard';
import CreateAutomationWizard from '@/components/settings/CreateAutomationWizard';
import RuleDetailsDrawer from '@/components/settings/RuleDetailsDrawer';
import type { CustomAutomationRule } from '@/components/settings/automation-builder/types';
import type { AutomationRuleDraft } from '@/lib/automationRules/types';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type CommTemplate = {
  id: string;
  key: string;
  channel: 'email' | 'sms' | 'in_app';
  name: string;
};

type SelectOption = {
  value: string;
  label: string;
};

type ProviderResponse = {
  smsEnabled: boolean;
  resendConfigured: boolean;
  senderIdentity?: { fromEmail: string | null };
};

type OrgSettings = {
  automationsDisabled?: boolean;
};

export default function AutomationsBuilderSection(props: {
  orgId: string;
  rules: CustomAutomationRule[];
  onRefresh: () => void;
}) {
  const { orgId, rules, onRefresh } = props;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailsRule, setDetailsRule] = useState<CustomAutomationRule | null>(null);
  const [autoRunTest, setAutoRunTest] = useState(false);
  const [templates, setTemplates] = useState<CommTemplate[]>([]);
  const [providerStatus, setProviderStatus] = useState({ emailReady: false, smsReady: false });
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateDraft, setDuplicateDraft] = useState<AutomationRuleDraft | null>(null);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [crewOptions, setCrewOptions] = useState<SelectOption[]>([]);
  const [materialCategoryOptions, setMaterialCategoryOptions] = useState<SelectOption[]>([]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/communications/templates?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<CommTemplate[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load templates');
      setTemplates(json.data ?? []);
    } catch (err) {
      setTemplates([]);
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    }
  }, [orgId]);

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch(`/api/communications/providers?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<ProviderResponse>;
      if (!res.ok || !json.ok) throw new Error('Failed to load providers');
      const emailReady = Boolean(json.data?.resendConfigured && json.data?.senderIdentity?.fromEmail);
      const smsReady = Boolean(json.data?.smsEnabled);
      setProviderStatus({ emailReady, smsReady });
    } catch (err) {
      setProviderStatus({ emailReady: false, smsReady: false });
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    }
  }, [orgId]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/settings?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<OrgSettings | null>;
      if (!res.ok || !json.ok) throw new Error('Failed to load settings');
      setSettings(json.data ?? {});
    } catch (err) {
      setSettings({});
    }
  }, [orgId]);

  const loadCrewOptions = useCallback(async () => {
    try {
      const res = await fetch(`/api/crews?orgId=${orgId}&activeOnly=true`);
      const json = (await res.json()) as ApiResponse<Array<{ id: string; displayName?: string | null; firstName?: string; lastName?: string }>>;
      if (!res.ok || !json.ok) throw new Error('Failed to load crews');
      const options =
        json.data?.map((crew) => ({
          value: crew.id,
          label: crew.displayName || [crew.firstName, crew.lastName].filter(Boolean).join(' ') || crew.id,
        })) ?? [];
      setCrewOptions(options);
    } catch (err) {
      setCrewOptions([]);
    }
  }, [orgId]);

  const loadMaterialCategories = useCallback(async () => {
    try {
      const res = await fetch(`/api/materials/categories?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<string[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load material categories');
      const options = (json.data ?? []).map((category) => ({
        value: category,
        label: category,
      }));
      setMaterialCategoryOptions(options);
    } catch (err) {
      setMaterialCategoryOptions([]);
    }
  }, [orgId]);

  useEffect(() => {
    void loadTemplates();
    void loadProviders();
    void loadSettings();
    void loadCrewOptions();
    void loadMaterialCategories();
  }, [loadCrewOptions, loadMaterialCategories, loadProviders, loadSettings, loadTemplates]);

  useEffect(() => {
    if (!detailsRule) return;
    const updated = rules.find((rule) => rule.id === detailsRule.id);
    if (updated && updated !== detailsRule) {
      setDetailsRule(updated);
    }
  }, [detailsRule, rules]);

  const blockedReasons = useMemo(() => {
    const reasons = new Map<string, string[]>();
    for (const rule of rules) {
      const list: string[] = [];
      if (rule.requiresEmail && !providerStatus.emailReady) list.push('Email provider not ready');
      if (rule.requiresSms && !providerStatus.smsReady) list.push('SMS provider not configured');
      reasons.set(rule.id, list);
    }
    return reasons;
  }, [providerStatus.emailReady, providerStatus.smsReady, rules]);

  const toggleKillSwitch = async () => {
    const nextValue = !(settings?.automationsDisabled ?? false);
    const confirmed = nextValue ? confirm('Disable all automations for this org?') : true;
    if (!confirmed) return;
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, automationsDisabled: nextValue }),
      });
      const json = (await res.json()) as ApiResponse<OrgSettings>;
      if (!res.ok || !json.ok) throw new Error('Failed to update settings');
      setSettings(json.data ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  const openDetails = (rule: CustomAutomationRule, runTest: boolean) => {
    setDetailsRule(rule);
    setAutoRunTest(runTest);
  };

  const handleDuplicate = (rule: CustomAutomationRule) => {
    setDuplicateDraft({
      name: `Copy of ${rule.name}`,
      description: rule.description ?? '',
      triggerKey: rule.triggerKey,
      triggerVersion: rule.triggerVersion ?? 1,
      conditions: rule.conditions ?? [],
      actions: rule.actions ?? [],
    });
    setWizardOpen(true);
  };

  const handleToggleRule = async (rule: CustomAutomationRule) => {
    setBusyRuleId(rule.id);
    try {
      const endpoint = rule.enabled ? 'disable' : 'enable';
      const res = await fetch(`/api/automations/rules/${rule.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, tested: true }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) throw new Error('Failed to update rule');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    } finally {
      setBusyRuleId(null);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary">Custom automations (MVP)</h2>
            <Badge className="bg-bg-section/80 text-text-tertiary">Guardrailed</Badge>
          </div>
          <p className="text-xs text-text-tertiary mt-1">Create your own trigger to actions rules. No coding.</p>
        </div>
        <Button variant="primary" onClick={() => { setDuplicateDraft(null); setWizardOpen(true); }}>
          Create automation
        </Button>
      </div>

      {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!(settings?.automationsDisabled ?? false)} onClick={toggleKillSwitch}>
          {settings?.automationsDisabled ? 'Automations disabled' : 'Automations enabled'}
        </Chip>
        {settings?.automationsDisabled && (
          <span className="text-xs text-amber-200">All custom automations are paused.</span>
        )}
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-text-tertiary">No custom automations yet.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              busy={busyRuleId === rule.id}
              blockedReasons={blockedReasons.get(rule.id)}
              onView={() => openDetails(rule, false)}
              onTest={() => openDetails(rule, true)}
              onToggle={() => handleToggleRule(rule)}
              onDuplicate={() => handleDuplicate(rule)}
            />
          ))}
        </div>
      )}

      {wizardOpen && (
        <CreateAutomationWizard
          open={wizardOpen}
          orgId={orgId}
          templates={templates}
          providerStatus={providerStatus}
          crewOptions={crewOptions}
          materialCategoryOptions={materialCategoryOptions}
          initialDraft={duplicateDraft ?? undefined}
          onClose={() => {
            setWizardOpen(false);
            setDuplicateDraft(null);
          }}
          onCreated={onRefresh}
        />
      )}

      {detailsRule && (
        <RuleDetailsDrawer
          open={Boolean(detailsRule)}
          orgId={orgId}
          rule={detailsRule}
          templates={templates}
          providerStatus={providerStatus}
          crewOptions={crewOptions}
          materialCategoryOptions={materialCategoryOptions}
          onClose={() => {
            setDetailsRule(null);
            setAutoRunTest(false);
          }}
          onUpdated={onRefresh}
          autoRunTest={autoRunTest}
        />
      )}
    </Card>
  );
}
