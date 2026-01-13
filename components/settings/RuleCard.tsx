'use client';

import { Badge, Button, Card, Chip } from '@/components/ui';
import { TRIGGER_LABELS } from '@/components/settings/automation-builder/constants';
import type { CustomAutomationRule } from '@/components/settings/automation-builder/types';

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export default function RuleCard(props: {
  rule: CustomAutomationRule;
  onView: () => void;
  onTest: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  busy?: boolean;
  blockedReasons?: string[];
}) {
  const { rule, onView, onTest, onToggle, onDuplicate, busy, blockedReasons } = props;
  const triggerMeta = TRIGGER_LABELS[rule.triggerKey];
  const blocked = blockedReasons && blockedReasons.length > 0;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{rule.name}</h3>
          <p className="text-xs text-text-tertiary mt-1">{triggerMeta?.label ?? rule.triggerKey}</p>
        </div>
        <Chip active={rule.enabled}>{rule.enabled ? 'Enabled' : 'Disabled'}</Chip>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {rule.isCustomerFacing && <Badge className="bg-amber-500/10 text-amber-300">Customer-facing</Badge>}
        {rule.requiresSms && <Badge className="bg-indigo-500/10 text-indigo-300">Requires SMS</Badge>}
        {rule.requiresEmail && <Badge className="bg-sky-500/10 text-sky-300">Requires Email</Badge>}
        {rule.lastStatus && <Badge className="bg-bg-section/80 text-text-tertiary">Last: {rule.lastStatus}</Badge>}
      </div>

      {rule.description && <p className="text-sm text-text-secondary">{rule.description}</p>}

      <div className="grid grid-cols-2 gap-2 text-xs text-text-tertiary">
        <div>
          <span className="block">Last test</span>
          <span className="text-text-secondary">{formatDate(rule.lastTestedAt)}</span>
        </div>
        <div>
          <span className="block">Last run</span>
          <span className="text-text-secondary">{formatDate(rule.lastRunAt)}</span>
        </div>
      </div>

      {blocked && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-200">
          Blocked: {blockedReasons?.join(', ')}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onView} disabled={busy}>
          View / Edit
        </Button>
        <Button size="sm" variant="secondary" onClick={onTest} disabled={busy}>
          Test
        </Button>
        <Button size="sm" variant={rule.enabled ? 'secondary' : 'primary'} onClick={onToggle} disabled={busy || blocked}>
          {rule.enabled ? 'Disable' : 'Enable'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDuplicate} disabled={busy}>
          Duplicate
        </Button>
      </div>
    </Card>
  );
}
