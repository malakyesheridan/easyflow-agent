'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Chip, Input, Select, Textarea } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';
import type { AutomationRuleDraft, RuleAction, RuleCondition, TriggerKey } from '@/lib/automationRules/types';
import type { ConditionDefinition } from '@/lib/automationRules/conditionsRegistry';
import { CONDITIONS_BY_TRIGGER, getConditionDefinition } from '@/lib/automationRules/conditionsRegistry';
import type { CustomAutomationRule } from '@/components/settings/automation-builder/types';
import {
  ACTION_LABELS,
  COMM_DEFAULT_TEMPLATE_BY_TO,
  getActionOptionsForEdition,
  getTriggerGroupsForEdition,
  TRIGGER_LABELS,
} from '@/components/settings/automation-builder/constants';
import { getAppEdition } from '@/lib/appEdition';

const MAX_CONDITIONS = 10;
const MAX_ACTIONS = 5;

type CommTemplate = {
  id: string;
  key: string;
  channel: 'email' | 'sms' | 'in_app';
  name: string;
};

type ProviderStatus = {
  emailReady: boolean;
  smsReady: boolean;
};

type SelectOption = {
  value: string;
  label: string;
};

type DryRunResult = {
  matched: boolean;
  matchDetails: any;
  actionPreviews: Array<{ channel: string; to: string; subject: string | null; previewText: string | null; templateKey: string }>;
  warnings: string[];
};

function buildDefaultActionWithType(type: RuleAction['type'], isTradeEdition: boolean): RuleAction {
  const defaultRecipient = isTradeEdition ? 'customer' : 'admin';
  if (type === 'comm.send_sms') {
    return { type, to: defaultRecipient, templateKey: COMM_DEFAULT_TEMPLATE_BY_TO[defaultRecipient] ?? COMM_DEFAULT_TEMPLATE_BY_TO.admin };
  }
  if (type === 'comm.send_inapp') {
    return { type, to: 'admin', templateKey: COMM_DEFAULT_TEMPLATE_BY_TO.admin };
  }
  if (type === 'job.add_tag') return { type, tag: 'needs_attention' };
  if (type === 'job.add_flag') return { type, flag: 'needs_attention' };
  if (type === 'tasks.create_checklist') return { type, checklistKey: '' };
  if (type === 'invoice.create_draft') return { type, mode: 'from_job' };
  if (type === 'reminder.create_internal') return { type, minutesFromNow: 60, message: '' };
  return { type: 'comm.send_email', to: defaultRecipient, templateKey: COMM_DEFAULT_TEMPLATE_BY_TO[defaultRecipient] ?? COMM_DEFAULT_TEMPLATE_BY_TO.admin };
}

const STATUS_CONDITION_KEYS = new Set(['job.new_status_equals', 'job.previous_status_equals']);
const PROGRESS_CONDITION_KEYS = new Set(['job.progress_gte', 'job.progress_lte']);

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function defaultValueForDefinition(definition: ConditionDefinition): string | number | boolean {
  if (definition.valueType === 'enum') return definition.enumValues?.[0] ?? '';
  if (definition.valueType === 'boolean') return false;
  if (definition.valueType === 'text') return '';
  return definition.min ?? 0;
}

function resolveEnumOptions(
  definition: ConditionDefinition,
  crewOptions: SelectOption[],
  materialCategoryOptions: SelectOption[]
): SelectOption[] {
  if (definition.enumSource === 'crew') return crewOptions;
  if (definition.enumSource === 'materialCategory') return materialCategoryOptions;
  return (definition.enumValues ?? []).map((value) => ({ value, label: formatEnumLabel(value) }));
}

function buildDefaultCondition(triggerKey: TriggerKey): RuleCondition {
  const allowed = CONDITIONS_BY_TRIGGER[triggerKey] ?? [];
  const definition = allowed[0];
  if (!definition) return { key: '', value: '' };
  return { key: definition.key, value: defaultValueForDefinition(definition) };
}

type CommAction = Extract<RuleAction, { type: 'comm.send_email' | 'comm.send_sms' | 'comm.send_inapp' }>;

function isCommAction(action: RuleAction): action is CommAction {
  return action.type === 'comm.send_email' || action.type === 'comm.send_sms' || action.type === 'comm.send_inapp';
}

function isCustomerFacing(actions: RuleAction[]): boolean {
  return actions.some((action) =>
    (action.type === 'comm.send_email' || action.type === 'comm.send_sms') && action.to === 'customer'
  );
}

function requiresSms(actions: RuleAction[]): boolean {
  return actions.some((action) => action.type === 'comm.send_sms');
}

function requiresEmail(actions: RuleAction[]): boolean {
  return actions.some((action) => action.type === 'comm.send_email');
}

function hasStatusCondition(conditions: RuleCondition[]): boolean {
  return conditions.some((condition) => STATUS_CONDITION_KEYS.has(condition.key));
}

function hasProgressCondition(conditions: RuleCondition[]): boolean {
  return conditions.some((condition) => PROGRESS_CONDITION_KEYS.has(condition.key));
}

function templateOptionsForChannel(templates: CommTemplate[], channel: CommTemplate['channel']) {
  return templates.filter((template) => template.channel === channel);
}

export default function RuleDetailsDrawer(props: {
  open: boolean;
  orgId: string;
  rule: CustomAutomationRule | null;
  templates: CommTemplate[];
  providerStatus: ProviderStatus;
  crewOptions: SelectOption[];
  materialCategoryOptions: SelectOption[];
  onClose: () => void;
  onUpdated: () => void;
  autoRunTest?: boolean;
}) {
  const { open, orgId, rule, templates, providerStatus, crewOptions, materialCategoryOptions, onClose, onUpdated, autoRunTest } = props;
  const edition = getAppEdition();
  const isTradeEdition = edition === 'trades';
  const actionOptions = getActionOptionsForEdition(edition);
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(onClose, isMobile);

  const [draft, setDraft] = useState<AutomationRuleDraft | null>(
    rule
      ? {
          name: rule.name,
          description: rule.description ?? '',
          triggerKey: rule.triggerKey,
          triggerVersion: rule.triggerVersion ?? 1,
          conditions: rule.conditions ?? [],
          actions: rule.actions ?? [],
        }
      : null
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<DryRunResult | null>(null);
  const [confirmedCustomerFacing, setConfirmedCustomerFacing] = useState(false);
  const [autoTested, setAutoTested] = useState(false);
  const [testedAtOverride, setTestedAtOverride] = useState<string | null>(null);
  
  useEffect(() => {
    if (!rule) return;
    setDraft({
      name: rule.name,
      description: rule.description ?? '',
      triggerKey: rule.triggerKey,
      triggerVersion: rule.triggerVersion ?? 1,
      conditions: rule.conditions ?? [],
      actions: rule.actions ?? [],
    });
    setTestResult(null);
    setConfirmedCustomerFacing(false);
    setAutoTested(false);
    setTestedAtOverride(null);
  }, [rule]);

  const triggerGroups = useMemo(() => {
    const base = getTriggerGroupsForEdition(edition);
    const currentGroup = draft ? TRIGGER_LABELS[draft.triggerKey]?.group : null;
    if (currentGroup && !base.includes(currentGroup)) return [...base, currentGroup];
    return base;
  }, [draft, edition]);
  const triggerMeta = draft ? TRIGGER_LABELS[draft.triggerKey] : null;
  const allowedDefinitions = draft ? CONDITIONS_BY_TRIGGER[draft.triggerKey] ?? [] : [];
  const allowedConditionKeys = allowedDefinitions.map((definition) => definition.key);
  const conditionsDisabled = allowedDefinitions.length === 0;
  const customerFacing = draft ? isCustomerFacing(draft.actions) : false;
  const statusTriggerMissing = draft ? draft.triggerKey === 'job.status_updated' && !hasStatusCondition(draft.conditions) : false;
  const progressTriggerMissing = draft ? draft.triggerKey === 'job.progress_updated' && !hasProgressCondition(draft.conditions) : false;
  const emailBlocked = draft ? requiresEmail(draft.actions) && !providerStatus.emailReady : false;
  const smsBlocked = draft ? requiresSms(draft.actions) && !providerStatus.smsReady : false;
  const testedRecently = useMemo(() => {
    const testedAtValue = testedAtOverride ?? rule?.lastTestedAt;
    if (!testedAtValue) return false;
    const testedAt = new Date(testedAtValue);
    if (Number.isNaN(testedAt.getTime())) return false;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    return testedAt >= tenMinutesAgo;
  }, [rule?.lastTestedAt, testedAtOverride]);

  const emailRecipientOptions = useMemo(() => {
    if (isTradeEdition) {
      return [
        { value: 'customer', label: 'Customer' },
        { value: 'admin', label: 'Admins' },
        { value: 'crew_assigned', label: 'Assigned crew' },
        { value: 'custom', label: 'Custom' },
      ];
    }
    return [
      { value: 'admin', label: 'Principals / Team Leads' },
      { value: 'custom', label: 'Custom' },
    ];
  }, [isTradeEdition]);

  const inAppRecipientOptions = useMemo(() => {
    if (isTradeEdition) {
      return [
        { value: 'admin', label: 'Admins' },
        { value: 'crew_assigned', label: 'Assigned crew' },
        { value: 'ops', label: 'Ops team' },
      ];
    }
    return [
      { value: 'admin', label: 'Principals / Team Leads' },
      { value: 'ops', label: 'Ops team' },
    ];
  }, [isTradeEdition]);

  const isDirty = useMemo(() => {
    if (!rule || !draft) return false;
    return (
      rule.name !== draft.name ||
      (rule.description ?? '') !== (draft.description ?? '') ||
      rule.triggerKey !== draft.triggerKey ||
      JSON.stringify(rule.conditions ?? []) !== JSON.stringify(draft.conditions ?? []) ||
      JSON.stringify(rule.actions ?? []) !== JSON.stringify(draft.actions ?? [])
    );
  }, [draft, rule]);

  const updateCondition = (index: number, next: RuleCondition) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextConditions = [...prev.conditions];
      nextConditions[index] = next;
      return { ...prev, conditions: nextConditions };
    });
  };

  const updateAction = (index: number, next: RuleAction) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextActions = [...prev.actions];
      nextActions[index] = next;
      return { ...prev, actions: nextActions };
    });
  };

  const addCondition = () => {
    if (!draft || conditionsDisabled || draft.conditions.length >= MAX_CONDITIONS) return;
    setDraft((prev) => (prev ? { ...prev, conditions: [...prev.conditions, buildDefaultCondition(prev.triggerKey)] } : prev));
  };

  const addAction = () => {
    if (!draft || draft.actions.length >= MAX_ACTIONS) return;
    setDraft((prev) =>
      prev ? { ...prev, actions: [...prev.actions, buildDefaultActionWithType('comm.send_email', isTradeEdition)] } : prev
    );
  };

  const removeCondition = (index: number) => {
    setDraft((prev) => (prev ? { ...prev, conditions: prev.conditions.filter((_, i) => i !== index) } : prev));
  };

  const removeAction = (index: number) => {
    setDraft((prev) => (prev ? { ...prev, actions: prev.actions.filter((_, i) => i !== index) } : prev));
  };

  const handleSave = async () => {
    if (!draft || !rule) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/automations/rules/${rule.id}?mode=custom`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'custom',
          orgId,
          name: draft.name,
          description: draft.description,
          triggerKey: draft.triggerKey,
          triggerVersion: draft.triggerVersion,
          conditions: draft.conditions,
          actions: draft.actions,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || 'Failed to save rule');
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleRunTest = useCallback(async () => {
    if (!draft || !rule) return;
    setTesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/automations/rules/${rule.id}/dry-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          sampleEventKey: draft.triggerKey,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || 'Dry-run failed');
      setTestResult(json.data as DryRunResult);
      setTestedAtOverride(new Date().toISOString());
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry-run failed');
    } finally {
      setTesting(false);
    }
  }, [draft, onUpdated, orgId, rule]);

  useEffect(() => {
    if (open && autoRunTest && !autoTested) {
      setAutoTested(true);
      void handleRunTest();
    }
  }, [autoRunTest, autoTested, handleRunTest, open]);

  if (!open || !rule || !draft) return null;

  const handleToggle = async () => {
    if (!rule) return;
    setEnabling(true);
    setError(null);
    try {
      if (rule.enabled) {
        const res = await fetch(`/api/automations/rules/${rule.id}/disable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error?.message || 'Failed to disable');
      } else {
        const res = await fetch(`/api/automations/rules/${rule.id}/enable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            tested: true,
            confirmed_customer_facing: confirmedCustomerFacing,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error?.message || 'Failed to enable');
      }
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
        <Card
          className={cn(
            'w-full bg-bg-base border border-border-subtle',
            isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-3xl'
          )}
          {...swipe}
        >
          <div className="p-4 md:p-6 space-y-4">
            {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Edit automation</h3>
                <p className="text-xs text-text-tertiary mt-1">{rule.name}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={onClose} disabled={saving || testing || enabling}>
                Close
              </Button>
            </div>

            {error && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input
                label="Description"
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            <Select
              label="Trigger"
              value={draft.triggerKey}
              onChange={(e) => setDraft({ ...draft, triggerKey: e.target.value as TriggerKey, conditions: [] })}
            >
              {triggerGroups.map((group) => (
                <optgroup key={group} label={group}>
                  {Object.entries(TRIGGER_LABELS)
                    .filter(([, meta]) => meta.group === group)
                    .map(([key, meta]) => (
                      <option key={key} value={key}>
                        {meta.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
            <p className="text-xs text-text-tertiary">Trigger fires when: {triggerMeta?.description ?? ''}</p>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Conditions</h4>
                  <p className="text-xs text-text-tertiary">All conditions must pass.</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={addCondition}
                  disabled={conditionsDisabled || draft.conditions.length >= MAX_CONDITIONS}
                >
                  Add condition
                </Button>
              </div>

              {statusTriggerMissing && (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                  Status-based triggers should specify which status change to listen for.
                </div>
              )}
              {progressTriggerMissing && (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                  Progress triggers should include a progress threshold.
                </div>
              )}

              {conditionsDisabled && (
                <p className="text-xs text-text-tertiary">This trigger does not support conditions.</p>
              )}
              {!conditionsDisabled && draft.conditions.length === 0 && (
                <p className="text-xs text-text-tertiary">Select a condition relevant to this trigger.</p>
              )}

              {draft.conditions.map((condition, index) => {
                const definition = getConditionDefinition(condition.key);
                const selectValue = allowedConditionKeys.includes(condition.key) ? condition.key : '';
                const enumOptions =
                  definition && definition.valueType === 'enum'
                    ? resolveEnumOptions(definition, crewOptions, materialCategoryOptions)
                    : [];
                const numericValue = typeof condition.value === 'number' ? condition.value : definition?.min ?? 0;

                const updateValue = (value: string | number | boolean) => {
                  updateCondition(index, { ...condition, value });
                };

                return (
                  <Card key={`${condition.key}-${index}`} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Select
                        label="Condition"
                        value={selectValue}
                        onChange={(e) => {
                          const key = e.target.value;
                          const nextDefinition = getConditionDefinition(key);
                          if (!nextDefinition) return;
                          updateCondition(index, { key: nextDefinition.key, value: defaultValueForDefinition(nextDefinition) });
                        }}
                      >
                        <option value="" disabled>
                          Select a condition relevant to this trigger
                        </option>
                        {allowedDefinitions.map((definition) => (
                          <option key={definition.key} value={definition.key}>
                            {definition.label}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="secondary" onClick={() => removeCondition(index)}>
                        Remove
                      </Button>
                    </div>

                    {!definition && (
                      <p className="text-xs text-amber-200">This condition is not supported for the selected trigger.</p>
                    )}

                    {definition?.valueType === 'enum' && (
                      <Select
                        label="Value"
                        value={typeof condition.value === 'string' ? condition.value : ''}
                        onChange={(e) => updateValue(e.target.value)}
                      >
                        <option value="" disabled>
                          {enumOptions.length === 0 ? 'No options available' : 'Select a value'}
                        </option>
                        {enumOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}

                    {definition?.valueType === 'boolean' && (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary">Value</p>
                          <p className="text-xs text-text-tertiary">{definition.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Chip active={condition.value === true} onClick={() => updateValue(true)}>
                            On
                          </Chip>
                          <Chip active={condition.value !== true} onClick={() => updateValue(false)}>
                            Off
                          </Chip>
                        </div>
                      </div>
                    )}

                    {definition?.valueType === 'text' && (
                      <Input
                        label="Value"
                        value={typeof condition.value === 'string' ? condition.value : ''}
                        onChange={(e) => updateValue(e.target.value)}
                        placeholder="Enter text"
                      />
                    )}

                    {definition?.valueType === 'number' && (
                      <Input
                        label="Value"
                        value={String(numericValue)}
                        inputMode="decimal"
                        type="number"
                        min={definition.min}
                        max={definition.max}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next)) return;
                          updateValue(next);
                        }}
                      />
                    )}

                    {definition?.valueType === 'hours' && (
                      <div className="space-y-1">
                        <Input
                          label="Hours"
                          value={String(numericValue)}
                          inputMode="numeric"
                          type="number"
                          min={definition.min ?? 1}
                          max={definition.max ?? 168}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            if (!Number.isFinite(next)) return;
                            updateValue(next);
                          }}
                        />
                        <p className="text-xs text-text-tertiary">Enter hours between 1 and 168.</p>
                      </div>
                    )}

                    {definition?.valueType === 'percentage' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <input
                            className="w-full accent-accent-gold"
                            type="range"
                            min={definition.min ?? 0}
                            max={definition.max ?? 100}
                            step={definition.step ?? 1}
                            value={numericValue}
                            onChange={(e) => updateValue(Number(e.target.value))}
                          />
                          <Input
                            label="Percent"
                            value={String(numericValue)}
                            inputMode="numeric"
                            type="number"
                            min={definition.min ?? 0}
                            max={definition.max ?? 100}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              if (!Number.isFinite(next)) return;
                              updateValue(next);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Actions</h4>
                  <p className="text-xs text-text-tertiary">Up to {MAX_ACTIONS} actions.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={addAction} disabled={draft.actions.length >= MAX_ACTIONS}>
                  Add action
                </Button>
              </div>

              {draft.actions.map((action, index) => {
                const commAction = isCommAction(action) ? action : null;
                const actionChannel = commAction
                  ? commAction.type === 'comm.send_email'
                    ? 'email'
                    : commAction.type === 'comm.send_sms'
                      ? 'sms'
                      : 'in_app'
                  : null;
                const templateOptions = actionChannel ? templateOptionsForChannel(templates, actionChannel) : [];
                const isCustomerAction =
                  commAction &&
                  (commAction.type === 'comm.send_email' || commAction.type === 'comm.send_sms') &&
                  commAction.to === 'customer';
                const baseRecipientOptions =
                  commAction && commAction.type === 'comm.send_inapp'
                    ? inAppRecipientOptions
                    : emailRecipientOptions;
                const recipientOptions =
                  commAction && !baseRecipientOptions.some((opt) => opt.value === commAction.to)
                    ? [
                        ...baseRecipientOptions,
                        { value: commAction.to, label: `Legacy: ${commAction.to.replace(/_/g, ' ')}` },
                      ]
                    : baseRecipientOptions;
                return (
                  <Card key={`${action.type}-${index}`} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Select
                        label="Action"
                        value={action.type}
                        onChange={(e) =>
                          updateAction(index, buildDefaultActionWithType(e.target.value as RuleAction['type'], isTradeEdition))
                        }
                      >
                        {(actionOptions.includes(action.type)
                          ? actionOptions
                          : [...actionOptions, action.type]
                        ).map((type) => (
                          <option key={type} value={type}>
                            {ACTION_LABELS[type] ?? type}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="secondary" onClick={() => removeAction(index)}>
                        Remove
                      </Button>
                    </div>

                    {commAction && actionChannel && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Select
                          label="Recipient"
                          value={commAction.to}
                          onChange={(e) => {
                            const to = e.target.value as any;
                            const templateKey = COMM_DEFAULT_TEMPLATE_BY_TO[to] ?? commAction.templateKey;
                            updateAction(index, { ...commAction, to, templateKey } as RuleAction);
                          }}
                        >
                          {recipientOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                        <Select
                          label="Template"
                          value={commAction.templateKey}
                          onChange={(e) => updateAction(index, { ...commAction, templateKey: e.target.value } as RuleAction)}
                        >
                          <option value={COMM_DEFAULT_TEMPLATE_BY_TO[commAction.to] ?? commAction.templateKey}>Use default template</option>
                          {templateOptions.map((template) => (
                            <option key={template.id} value={template.key}>
                              {template.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

                    {action.type === 'comm.send_email' && action.to === 'custom' && (
                      <Input
                        label="Custom email"
                        value={action.customEmail ?? ''}
                        onChange={(e) => updateAction(index, { ...action, customEmail: e.target.value })}
                      />
                    )}
                    {action.type === 'comm.send_sms' && action.to === 'custom' && (
                      <Input
                        label="Custom phone"
                        value={action.customPhone ?? ''}
                        onChange={(e) => updateAction(index, { ...action, customPhone: e.target.value })}
                      />
                    )}

                    {action.type === 'job.add_tag' && (
                      <Input label="Tag" value={action.tag} onChange={(e) => updateAction(index, { ...action, tag: e.target.value })} />
                    )}
                    {action.type === 'job.add_flag' && (
                      <Input label="Flag" value={action.flag} onChange={(e) => updateAction(index, { ...action, flag: e.target.value })} />
                    )}
                    {action.type === 'tasks.create_checklist' && (
                      <Input
                        label="Checklist key"
                        value={action.checklistKey}
                        onChange={(e) => updateAction(index, { ...action, checklistKey: e.target.value })}
                      />
                    )}
                    {action.type === 'reminder.create_internal' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Input
                          label="Minutes from now"
                          value={String(action.minutesFromNow)}
                          onChange={(e) => updateAction(index, { ...action, minutesFromNow: Number(e.target.value) || 0 })}
                        />
                        <Input
                          label="Message"
                          value={action.message}
                          onChange={(e) => updateAction(index, { ...action, message: e.target.value })}
                        />
                      </div>
                    )}

                    {isCustomerAction && <Badge className="bg-amber-500/10 text-amber-300">Customer-facing</Badge>}
                  </Card>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleRunTest} disabled={testing || saving}>
                {testing ? 'Testing...' : 'Run dry test'}
              </Button>
              <Button variant="secondary" onClick={handleSave} disabled={!isDirty || saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
              <Button
                onClick={handleToggle}
                disabled={
                  enabling ||
                  !testedRecently ||
                  isDirty ||
                  emailBlocked ||
                  smsBlocked ||
                  (customerFacing && !confirmedCustomerFacing)
                }
              >
                {enabling ? 'Updating...' : rule.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>

            {!testedRecently && (
              <p className="text-xs text-amber-200">Enable requires a dry-run test within the last 10 minutes.</p>
            )}
            {isDirty && (
              <p className="text-xs text-amber-200">Save changes before enabling.</p>
            )}

            {customerFacing && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmedCustomerFacing}
                    onChange={(e) => setConfirmedCustomerFacing(e.target.checked)}
                  />
                  I understand this will message customers.
                </label>
              </div>
            )}

            {testResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={testResult.matched ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-200'}>
                    {testResult.matched ? 'Matched' : 'Not matched'}
                  </Badge>
                  <span className="text-xs text-text-tertiary">Dry-run result</span>
                </div>
                {testResult.actionPreviews.map((preview, idx) => (
                  <div key={`${preview.templateKey}-${idx}`} className="rounded-md border border-border-subtle bg-bg-section/20 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">{preview.channel} ? {preview.to}</span>
                      <Badge className="bg-bg-section/80 text-text-tertiary">{preview.templateKey}</Badge>
                    </div>
                    {preview.subject && <div className="text-text-primary mt-2">{preview.subject}</div>}
                    <div className="text-text-tertiary mt-1">{preview.previewText ?? '-'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
