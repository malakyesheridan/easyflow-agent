import type { Task } from '@/db/schema/tasks';

export function getRequiredTaskProgress(tasks: Task[]): {
  requiredTotal: number;
  requiredCompleted: number;
  percent: number | null;
} {
  const required = tasks.filter((t) => t.isRequired);
  const requiredTotal = required.length;
  const requiredCompleted = required.filter((t) => t.status === 'completed').length;
  const percent = requiredTotal > 0 ? (requiredCompleted / requiredTotal) * 100 : null;

  return { requiredTotal, requiredCompleted, percent };
}

