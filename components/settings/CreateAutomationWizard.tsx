'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, Chip, Input, Select, Textarea } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';
import type { AutomationRuleDraft, RuleAction, RuleCondition, TriggerKey } from '@/lib/automationRules/types';
import type { ConditionDefinition } from '@/lib/automationRules/conditionsRegistry';
import { CONDITIONS_BY_TRIGGER, getConditionDefinition } from '@/lib/automationRules/conditionsRegistry';
import { TRIGGER_GROUPS, TRIGGER_LABELS, COMM_DEFAULT_TEMPLATE_BY_TO } from '@/components/settings/automation-builder/constants';

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

function buildDefaultAction(): RuleAction {
  return { type: 'comm.send_email', to: 'customer', templateKey: COMM_DEFAULT_TEMPLATE_BY_TO.customer };
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

export default function CreateAutomationWizard(props: {
  open: boolean;
  orgId: string;
  templates: CommTemplate[];
  providerStatus: ProviderStatus;
  crewOptions: SelectOption[];
  materialCategoryOptions: SelectOption[];
  onClose: () => void;
  onCreated: () => void;
  initialDraft?: AutomationRuleDraft;
}) {
  const { open, orgId, templates, providerStatus, crewOptions, materialCategoryOptions, onClose, onCreated, initialDraft } = props;
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<AutomationRuleDraft>(
    initialDraft ?? {
      name: '',
      description: '',
      triggerKey: 'job.created',
      triggerVersion: 1,
      conditions: [],
      actions: [buildDefaultAction()],
    }
  );
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [testResult, setTestResult] = useState<DryRunResult | null>(null);
  const [confirmedCustomerFacing, setConfirmedCustomerFacing] = useState(false);

  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(() => {
    if (!saving && !testing && !enabling) onClose();
  }, isMobile);

  const triggerMeta = TRIGGER_LABELS[draft.triggerKey];
  const customerFacing = isCustomerFacing(draft.actions);
  const statusTriggerMissing = draft.triggerKey === 'job.status_updated' && !hasStatusCondition(draft.conditions);
  const progressTriggerMissing = draft.triggerKey === 'job.progress_updated' && !hasProgressCondition(draft.conditions);

  const allowedDefinitions = CONDITIONS_BY_TRIGGER[draft.triggerKey] ?? [];
  const allowedConditionKeys = allowedDefinitions.map((definition) => definition.key);
  const conditionsDisabled = allowedDefinitions.length === 0;

  const emailBlocked = requiresEmail(draft.actions) && !providerStatus.emailReady;
  const smsBlocked = requiresSms(draft.actions) && !providerStatus.smsReady;

  const actionPreviewText = useMemo(() => {
    if (!testResult) return null;
    return testResult.actionPreviews.length > 0;
  }, [testResult]);

  if (!open) return null;

  const updateCondition = (index: number, next: RuleCondition) => {
    setDraft((prev) => {
      const nextConditions = [...prev.conditions];
      nextConditions[index] = next;
      return { ...prev, conditions: nextConditions };
    });
  };

  const updateAction = (index: number, next: RuleAction) => {
    setDraft((prev) => {
      const nextActions = [...prev.actions];
      nextActions[index] = next;
      return { ...prev, actions: nextActions };
    });
  };

  const addCondition = () => {
    if (conditionsDisabled || draft.conditions.length >= MAX_CONDITIONS) return;
    setDraft((prev) => ({ ...prev, conditions: [...prev.conditions, buildDefaultCondition(prev.triggerKey)] }));
  };

  const addSpecificCondition = (condition: RuleCondition) => {
    if (draft.conditions.length >= MAX_CONDITIONS) return;
    setDraft((prev) => ({ ...prev, conditions: [...prev.conditions, condition] }));
  };

  const addAction = () => {
    if (draft.actions.length >= MAX_ACTIONS) return;
    setDraft((prev) => ({ ...prev, actions: [...prev.actions, buildDefaultAction()] }));
  };

  const removeCondition = (index: number) => {
    setDraft((prev) => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== index) }));
  };

  const removeAction = (index: number) => {
    setDraft((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== index) }));
  };

  const handleRunTest = async () => {
    setError(null);
    setTesting(true);
    try {
      let resolvedRuleId = ruleId;
      if (!resolvedRuleId) {
        setSaving(true);
        const createRes = await fetch('/api/automations/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'custom',
            orgId,
            name: draft.name,
            description: draft.description,
            triggerKey: draft.triggerKey,
            triggerVersion: draft.triggerVersion ?? 1,
            conditions: draft.conditions,
            actions: draft.actions,
          }),
        });
        const createJson = await createRes.json();
        if (!createRes.ok || !createJson.ok) throw new Error(createJson.error?.message || 'Failed to create rule');
        resolvedRuleId = createJson.data.id;
        setRuleId(resolvedRuleId);
        onCreated();
      }

      const dryRes = await fetch(`/api/automations/rules/${resolvedRuleId}/dry-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          sampleEventKey: draft.triggerKey,
        }),
      });
      const dryJson = await dryRes.json();
      if (!dryRes.ok || !dryJson.ok) throw new Error(dryJson.error?.message || 'Dry-run failed');
      setTestResult(dryJson.data as DryRunResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry-run failed');
    } finally {
      setSaving(false);
      setTesting(false);
    }
  };

  const handleEnable = async () => {
    if (!ruleId) return;
    setEnabling(true);
    setError(null);
    try {
      const res = await fetch(`/api/automations/rules/${ruleId}/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          tested: true,
          confirmed_customer_facing: confirmedCustomerFacing,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || 'Failed to enable automation');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable automation');
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
                <h3 className="text-lg font-semibold text-text-primary">Create automation</h3>
                <p className="text-xs text-text-tertiary mt-1">Custom automation builder (MVP)</p>
              </div>
              <Button variant="secondary" size="sm" onClick={onClose} disabled={saving || testing || enabling}>
                Close
              </Button>
            </div>

            {error && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
            )}

            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((value) => (
                <Chip key={value} active={step === value} onClick={() => setStep(value)}>
                  Step {value}
                </Chip>
              ))}
            </div>

            {step === 1 && (
              <div className="space-y-3">
                <Input
                  label="Name"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
                <Textarea
                  label="Description"
                  rows={3}
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
                <Select
                  label="Trigger"
                  value={draft.triggerKey}
                  onChange={(e) => {
                    const nextKey = e.target.value as TriggerKey;
                    setDraft((prev) => ({ ...prev, triggerKey: nextKey, conditions: [] }));
                  }}
                >
                  {TRIGGER_GROUPS.map((group) => (
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
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">Conditions (optional)</h4>
                    <p className="text-xs text-text-tertiary">All conditions must pass (AND).</p>
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

                {draft.triggerKey === 'job.status_updated' && (
                  <div className="flex flex-wrap gap-2">
                    <Chip onClick={() => addSpecificCondition({ key: 'job.new_status_equals', value: 'scheduled' })}>
                      Add status filter
                    </Chip>
                  </div>
                )}
                {draft.triggerKey === 'job.progress_updated' && (
                  <div className="flex flex-wrap gap-2">
                    <Chip onClick={() => addSpecificCondition({ key: 'job.progress_gte', value: 50 })}>
                      Add progress {'>'}= 50%
                    </Chip>
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
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">Actions</h4>
                    <p className="text-xs text-text-tertiary">Run up to {MAX_ACTIONS} actions in sequence.</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={addAction} disabled={draft.actions.length >= MAX_ACTIONS}>
                    Add action
                  </Button>
                </div>

                {customerFacing && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Customer-facing actions will message customers. They require explicit confirmation to enable.
                  </div>
                )}

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
                  return (
                    <Card key={`${action.type}-${index}`} className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Select
                          label="Action"
                          value={action.type}
                          onChange={(e) => updateAction(index, buildDefaultActionWithType(e.target.value as RuleAction['type']))}
                        >
                          <option value="comm.send_email">Send email</option>
                          <option value="comm.send_sms">Send SMS</option>
                          <option value="comm.send_inapp">Send in-app notification</option>
                          <option value="job.add_tag">Add job tag</option>
                          <option value="job.add_flag">Add job flag</option>
                          <option value="tasks.create_checklist">Create checklist tasks</option>
                          <option value="invoice.create_draft">Create draft invoice</option>
                          <option value="reminder.create_internal">Create internal reminder</option>
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
                            {commAction.type !== 'comm.send_inapp' && <option value="customer">Customer</option>}
                            <option value="admin">Admins</option>
                            <option value="crew_assigned">Assigned crew</option>
                            {commAction.type !== 'comm.send_inapp' && <option value="custom">Custom</option>}
                            {commAction.type === 'comm.send_inapp' && <option value="ops">Ops team</option>}
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
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">Test + Enable</h4>
                    <p className="text-xs text-text-tertiary">Run a dry test before enabling.</p>
                  </div>
                  <Button variant="secondary" onClick={handleRunTest} disabled={testing || saving}>
                    {testing ? 'Testing...' : 'Run dry test'}
                  </Button>
                </div>

                {progressTriggerMissing && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Progress triggers require a progress threshold condition before enabling.
                  </div>
                )}
                {statusTriggerMissing && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Status-based triggers require a status condition before enabling.
                  </div>
                )}

                {(emailBlocked || smsBlocked) && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    {emailBlocked && 'Email provider is not ready.'}
                    {emailBlocked && smsBlocked && ' '}
                    {smsBlocked && 'SMS provider is not configured.'}
                  </div>
                )}

                {testResult && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className={testResult.matched ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-200'}>
                        {testResult.matched ? 'Matched' : 'Not matched'}
                      </Badge>
                      <span className="text-xs text-text-tertiary">Dry-run result</span>
                    </div>
                    {testResult.warnings?.length > 0 && (
                      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                        Warnings: {testResult.warnings.join(', ')}
                      </div>
                    )}
                    {actionPreviewText && (
                      <div className="space-y-2">
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

                <Button
                  onClick={handleEnable}
                  disabled={
                    enabling ||
                    !testResult ||
                    emailBlocked ||
                    smsBlocked ||
                    (customerFacing && !confirmedCustomerFacing)
                  }
                >
                  {enabling ? 'Enabling...' : 'Enable automation'}
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button variant="secondary" onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1}>
                Back
              </Button>
              <Button onClick={() => setStep((prev) => Math.min(4, prev + 1))} disabled={step === 4}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  function buildDefaultActionWithType(type: RuleAction['type']): RuleAction {
    if (type === 'comm.send_sms') {
      return { type, to: 'customer', templateKey: COMM_DEFAULT_TEMPLATE_BY_TO.customer };
    }
    if (type === 'comm.send_inapp') {
      return { type, to: 'ops', templateKey: COMM_DEFAULT_TEMPLATE_BY_TO.ops };
    }
    if (type === 'job.add_tag') return { type, tag: 'needs_attention' };
    if (type === 'job.add_flag') return { type, flag: 'needs_attention' };
    if (type === 'tasks.create_checklist') return { type, checklistKey: '' };
    if (type === 'invoice.create_draft') return { type, mode: 'from_job' };
    if (type === 'reminder.create_internal') return { type, minutesFromNow: 60, message: '' };
    return { type: 'comm.send_email', to: 'customer', templateKey: COMM_DEFAULT_TEMPLATE_BY_TO.customer };
  }
}
