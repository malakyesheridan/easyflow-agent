import type { AppEventType } from '@/lib/integrations/events/types';

export const integrationActionTypes = [
  'stripe.create_payment_link',
  'stripe.create_deposit_invoice',
  'xero.create_invoice_draft',
  'xero.sync_invoice',
  'xero.sync_invoice_status',
  'inventory.reserve_stock',
  'inventory.deduct_stock',
  'inventory.sync_levels',
  'webhook.deliver',
] as const;

export type IntegrationActionType = (typeof integrationActionTypes)[number];

export type IntegrationRuleCondition = {
  jobStatusIn?: string[];
  assignmentTypeIn?: string[];
  materialIdIn?: string[];
};

export type IntegrationRuleAction = {
  type: IntegrationActionType;
  params?: Record<string, unknown>;
};

export type IntegrationRule = {
  id: string;
  name: string;
  enabled: boolean;
  when: AppEventType;
  conditions?: IntegrationRuleCondition;
  action: IntegrationRuleAction;
};

export const defaultRulesByProvider: Record<string, IntegrationRule[]> = {
  stripe: [
    {
      id: 'stripe-job-completed-payment-link',
      name: 'Create payment link on job completion',
      enabled: false,
      when: 'job.completed',
      action: {
        type: 'stripe.create_payment_link',
        params: { amountCents: 0, currency: 'AUD' },
      },
    },
    {
      id: 'stripe-job-assigned-deposit',
      name: 'Create deposit invoice on assignment',
      enabled: false,
      when: 'job.assigned',
      action: {
        type: 'stripe.create_deposit_invoice',
        params: { amountCents: 0, currency: 'AUD' },
      },
    },
  ],
  xero: [
    {
      id: 'xero-invoice-issued-sync',
      name: 'Sync issued invoices to Xero',
      enabled: false,
      when: 'invoice.issued',
      action: {
        type: 'xero.sync_invoice',
      },
    },
  ],
  inventory_generic: [
    {
      id: 'inventory-job-assigned-reserve',
      name: 'Reserve stock when job assigned',
      enabled: false,
      when: 'job.assigned',
      action: {
        type: 'inventory.reserve_stock',
      },
    },
    {
      id: 'inventory-job-completed-deduct',
      name: 'Deduct stock when job completed',
      enabled: false,
      when: 'job.completed',
      action: {
        type: 'inventory.deduct_stock',
      },
    },
    {
      id: 'inventory-material-sync',
      name: 'Sync levels when stock changes',
      enabled: false,
      when: 'material.stock.updated',
      action: {
        type: 'inventory.sync_levels',
      },
    },
    {
      id: 'inventory-low-stock-sync',
      name: 'Sync when low stock alert triggers',
      enabled: false,
      when: 'material.stock.low',
      action: {
        type: 'inventory.sync_levels',
      },
    },
  ],
  custom_api: [
    {
      id: 'webhook-job-completed',
      name: 'Deliver job completion webhook',
      enabled: false,
      when: 'job.completed',
      action: {
        type: 'webhook.deliver',
      },
    },
  ],
};

export function evaluateRuleConditions(
  rule: IntegrationRule,
  payload: Record<string, unknown>
): boolean {
  if (!rule.conditions) return true;
  const conditions = rule.conditions;

  if (conditions.jobStatusIn && conditions.jobStatusIn.length > 0) {
    const status = payload.status;
    if (typeof status !== 'string' || !conditions.jobStatusIn.includes(status)) {
      return false;
    }
  }

  if (conditions.assignmentTypeIn && conditions.assignmentTypeIn.length > 0) {
    const assignmentType = payload.assignmentType;
    if (typeof assignmentType !== 'string' || !conditions.assignmentTypeIn.includes(assignmentType)) {
      return false;
    }
  }

  if (conditions.materialIdIn && conditions.materialIdIn.length > 0) {
    const materialId = payload.materialId;
    if (typeof materialId !== 'string' || !conditions.materialIdIn.includes(materialId)) {
      return false;
    }
  }

  return true;
}
