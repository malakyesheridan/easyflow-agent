import type { RuleAction, RuleCondition, TriggerKey } from '@/lib/automationRules/types';

export type CustomAutomationRule = {
  id: string;
  orgId?: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerKey: TriggerKey;
  triggerVersion: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  isCustomerFacing: boolean;
  requiresSms: boolean;
  requiresEmail: boolean;
  lastTestedAt: string | null;
  lastEnabledAt: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomAutomationRun = {
  id: string;
  orgId: string;
  ruleId: string;
  eventId: string;
  eventKey: string;
  eventPayload: any;
  matched: boolean;
  matchDetails: any;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  idempotencyKey: string;
  rateLimited: boolean;
  error: string | null;
  errorDetails: any | null;
  createdAt: string;
};

export type CustomAutomationRunStep = {
  id: string;
  runId: string;
  stepIndex: number;
  actionType: string;
  actionInput: any;
  status: string;
  result: any | null;
  commPreview: any | null;
  error: string | null;
  errorDetails: any | null;
  createdAt: string;
};
