import type { ConditionNode, ConditionOperand, ConditionValue } from '@/lib/automations/types';
import { getValueByPath } from '@/lib/automations/utils';

export type ConditionTrace = {
  path: string;
  result: boolean;
  message?: string;
  left?: unknown;
  right?: unknown;
  op?: string;
};

function resolveOperand(operand: ConditionOperand, context: Record<string, unknown>): unknown {
  if (operand && typeof operand === 'object' && !Array.isArray(operand)) {
    const refValue = (operand as { ref?: string }).ref;
    if (refValue) return getValueByPath(context, refValue);
    if ('value' in operand) {
      return (operand as { value: ConditionValue }).value;
    }
  }
  return operand as ConditionValue;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return null;
}

function normalizeArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function compareValues(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case 'exists':
      return left !== null && left !== undefined;
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const leftNum = coerceNumber(left);
      const rightNum = coerceNumber(right);
      if (leftNum === null || rightNum === null) return false;
      if (op === 'gt') return leftNum > rightNum;
      if (op === 'gte') return leftNum >= rightNum;
      if (op === 'lt') return leftNum < rightNum;
      return leftNum <= rightNum;
    }
    case 'in': {
      const list = normalizeArray(right);
      if (!list) return false;
      return list.includes(left);
    }
    case 'contains': {
      if (typeof left === 'string' && typeof right === 'string') {
        return left.includes(right);
      }
      const list = normalizeArray(left);
      if (!list) return false;
      return list.includes(right);
    }
    default:
      return false;
  }
}

function evaluateTimeCondition(
  node: Extract<ConditionNode, { time: { op: string; value?: number | string; ref?: string } }>,
  context: Record<string, unknown>
): boolean {
  const event = context.event as Record<string, unknown> | undefined;
  const ref = typeof node.time.ref === 'string' ? node.time.ref : null;
  const refValue = ref ? getValueByPath(context, ref) : null;
  const occurredAtRaw = typeof refValue === 'string' ? refValue : event?.occurredAt;
  const occurredAt = typeof occurredAtRaw === 'string' ? new Date(occurredAtRaw) : new Date();
  const op = node.time.op;
  const value = node.time.value;

  if (op === 'within_hours') {
    const hours = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(hours)) return false;
    const diffMs = Math.abs(Date.now() - occurredAt.getTime());
    return diffMs <= hours * 60 * 60 * 1000;
  }

  if (op === 'outside_business_hours') {
    const orgSettings = (context.org as Record<string, unknown> | undefined)?.settings as
      | Record<string, unknown>
      | undefined;
    const startMinutes = typeof orgSettings?.defaultWorkdayStartMinutes === 'number'
      ? orgSettings.defaultWorkdayStartMinutes
      : 8 * 60;
    const endMinutes = typeof orgSettings?.defaultWorkdayEndMinutes === 'number'
      ? orgSettings.defaultWorkdayEndMinutes
      : 17 * 60;
    const timeZone = typeof orgSettings?.timezone === 'string' ? orgSettings.timezone : undefined;

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(occurredAt);
    const hourPart = parts.find((part) => part.type === 'hour')?.value;
    const minutePart = parts.find((part) => part.type === 'minute')?.value;
    const hours = Number(hourPart);
    const minutes = Number(minutePart);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
    const totalMinutes = hours * 60 + minutes;
    return totalMinutes < startMinutes || totalMinutes > endMinutes;
  }

  if (op === 'before' || op === 'after') {
    if (typeof value !== 'string') return false;
    const compareDate = new Date(value);
    if (Number.isNaN(compareDate.getTime())) return false;
    return op === 'before' ? occurredAt.getTime() < compareDate.getTime() : occurredAt.getTime() > compareDate.getTime();
  }

  return false;
}

function evaluateNode(
  node: ConditionNode,
  context: Record<string, unknown>,
  trace: ConditionTrace[],
  path: string
): boolean {
  if ('all' in node) {
    const results = node.all.map((child, index) => evaluateNode(child, context, trace, `${path}.all.${index}`));
    const pass = results.every(Boolean);
    trace.push({ path, result: pass, message: 'all' });
    return pass;
  }
  if ('any' in node) {
    const results = node.any.map((child, index) => evaluateNode(child, context, trace, `${path}.any.${index}`));
    const pass = results.some(Boolean);
    trace.push({ path, result: pass, message: 'any' });
    return pass;
  }
  if ('not' in node) {
    const result = !evaluateNode(node.not, context, trace, `${path}.not`);
    trace.push({ path, result, message: 'not' });
    return result;
  }
  if ('compare' in node) {
    const left = resolveOperand(node.compare.left, context);
    const right = resolveOperand(node.compare.right, context);
    const pass = compareValues(node.compare.op, left, right);
    trace.push({
      path,
      result: pass,
      op: node.compare.op,
      left,
      right,
    });
    return pass;
  }
  if ('time' in node) {
    const pass = evaluateTimeCondition(node, context);
    trace.push({ path, result: pass, message: node.time.op });
    return pass;
  }

  trace.push({ path, result: false, message: 'unsupported_condition' });
  return false;
}

/**
 * Evaluates a list of conditions against the provided context.
 */
export function evaluateConditions(
  conditions: ConditionNode[],
  context: Record<string, unknown>
): { pass: boolean; trace: ConditionTrace[] } {
  const trace: ConditionTrace[] = [];
  if (conditions.length === 0) {
    return { pass: true, trace };
  }
  const results = conditions.map((node, index) => evaluateNode(node, context, trace, `conditions.${index}`));
  return { pass: results.every(Boolean), trace };
}
