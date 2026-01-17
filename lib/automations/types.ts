export type AutomationTriggerType = string;

export type AutomationTriggerFilters = Record<string, unknown>;

export type ConditionValue = string | number | boolean | null | string[] | number[] | boolean[];

export type ConditionOperand =
  | ConditionValue
  | { ref: string }
  | { value: ConditionValue };

export type ConditionCompareOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'exists';

export type ConditionNode =
  | { all: ConditionNode[] }
  | { any: ConditionNode[] }
  | { not: ConditionNode }
  | {
      compare: {
        left: ConditionOperand;
        op: ConditionCompareOp;
        right: ConditionOperand;
      };
    }
  | {
      time: {
        op: 'within_hours' | 'outside_business_hours' | 'before' | 'after';
        value?: number | string;
        ref?: string;
      };
    };

export type AutomationActionType =
  | 'comms.send'
  | 'notification.create'
  | 'job.update'
  | 'schedule.update'
  | 'schedule.create'
  | 'materials.adjust'
  | 'task.create'
  | 'webhook.call'
  | 'invoice.draft'
  | 'integration.emit';

export type RecipientReference =
  | { type: 'ref'; ref: string }
  | { type: 'user'; userId: string }
  | { type: 'email'; email: string }
  | { type: 'phone'; phone: string };

export type AutomationActionBase = {
  id: string;
  type: AutomationActionType;
  name?: string;
};

export type AutomationActionComms = AutomationActionBase & {
  type: 'comms.send';
  params: {
    channel: 'email' | 'sms' | 'in_app';
    eventKey: string;
    recipients?: RecipientReference[];
    variables?: Record<string, unknown>;
    options?: {
      delayMinutes?: number;
      digestMode?: boolean;
    };
  };
};

export type AutomationActionNotification = AutomationActionBase & {
  type: 'notification.create';
  params: {
    title: string;
    body: string;
    recipients?: RecipientReference[];
    severity?: 'info' | 'warning' | 'critical';
  };
};

export type AutomationActionJobUpdate = AutomationActionBase & {
  type: 'job.update';
  params: {
    jobId?: string;
    updates: {
      status?: string;
      progressStatus?: string;
      crewId?: string | null;
      scheduledStart?: string | null;
      scheduledEnd?: string | null;
      dueDate?: string | null;
      tags?: string[];
    };
  };
};

export type AutomationActionScheduleUpdate = AutomationActionBase & {
  type: 'schedule.update';
  params: {
    assignmentId: string;
    date?: string;
    startMinutes?: number;
    endMinutes?: number;
    crewId?: string;
    assignmentType?: string | null;
    status?: string;
  };
};

export type AutomationActionScheduleCreate = AutomationActionBase & {
  type: 'schedule.create';
  params: {
    jobId: string;
    crewId: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    assignmentType?: string | null;
    status?: string;
  };
};

export type AutomationActionMaterialsAdjust = AutomationActionBase & {
  type: 'materials.adjust';
  params: {
    materialId: string;
    quantity: number;
    reason?: string | null;
    eventType?: 'stock_added' | 'manual_adjustment' | 'job_consumed' | 'stocktake';
    jobId?: string | null;
  };
};

export type AutomationActionTaskCreate = AutomationActionBase & {
  type: 'task.create';
  params: {
    jobId?: string;
    title: string;
    description?: string | null;
    isRequired?: boolean;
    order?: number | null;
  };
};

export type AutomationActionWebhook = AutomationActionBase & {
  type: 'webhook.call';
  params: {
    url: string;
    method?: 'POST' | 'PUT';
    payload?: Record<string, unknown>;
  };
};

export type AutomationActionInvoiceDraft = AutomationActionBase & {
  type: 'invoice.draft';
  params: {
    jobId?: string;
  };
};

export type AutomationActionIntegrationEmit = AutomationActionBase & {
  type: 'integration.emit';
  params: {
    providerKey: string;
    payload?: Record<string, unknown>;
  };
};

export type AutomationActionNode =
  | AutomationActionComms
  | AutomationActionNotification
  | AutomationActionJobUpdate
  | AutomationActionScheduleUpdate
  | AutomationActionScheduleCreate
  | AutomationActionMaterialsAdjust
  | AutomationActionTaskCreate
  | AutomationActionWebhook
  | AutomationActionInvoiceDraft
  | AutomationActionIntegrationEmit;

export type AutomationThrottle = {
  windowHours: number;
  maxPerWindow: number;
  scope: 'org' | 'entity' | 'job';
};

export type AutomationRuleInput = {
  orgId: string;
  name: string;
  description?: string | null;
  templateKey?: string | null;
  isEnabled?: boolean;
  triggerType: AutomationTriggerType;
  triggerFilters?: AutomationTriggerFilters | null;
  conditions?: ConditionNode[] | null;
  actions: AutomationActionNode[];
  throttle?: AutomationThrottle | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  version?: number;
};

export type AutomationLogEntry = {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
};

export type AutomationTemplateConfigField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'toggle' | 'recipients';
  path: string;
  defaultValue?: string | number | boolean | string[] | null;
  options?: Array<{ value: string; label: string }>;
  helperText?: string;
};

export type AutomationTemplate = {
  key: string;
  name: string;
  description: string;
  category:
    | 'communications'
    | 'operations'
    | 'materials'
    | 'progress'
    | 'safety'
    | 'contacts'
    | 'appraisals'
    | 'listings'
    | 'reports';
  triggerType: AutomationTriggerType;
  triggerFilters?: AutomationTriggerFilters;
  conditions?: ConditionNode[];
  actions: AutomationActionNode[];
  configSchema: AutomationTemplateConfigField[];
};
