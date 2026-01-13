/**
 * Safely reads a nested value from an object using dot-separated path.
 */
export function getValueByPath(value: unknown, path: string): unknown {
  if (!path) return value;
  const parts = path.split('.').filter(Boolean);
  let current: unknown = value;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Returns a new object with a nested value set at the dot-separated path.
 */
export function setValueByPath<T extends Record<string, unknown>>(
  target: T,
  path: string,
  value: unknown
): T {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return target;

  const clone: Record<string, unknown> | unknown[] = Array.isArray(target) ? [...target] : { ...target };
  let cursor: Record<string, unknown> | unknown[] = clone;

  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    const isLast = i === parts.length - 1;
    const isIndex = /^\d+$/.test(key);
    const nextIsIndex = i + 1 < parts.length && /^\d+$/.test(parts[i + 1]);

    if (isLast) {
      if (isIndex) {
        if (!Array.isArray(cursor)) return clone as T;
        cursor[Number(key)] = value;
      } else if (!Array.isArray(cursor)) {
        cursor[key] = value;
      }
      break;
    }

    if (isIndex) {
      if (!Array.isArray(cursor)) return clone as T;
      const index = Number(key);
      const next = cursor[index];
      if (!next || typeof next !== 'object') {
        cursor[index] = nextIsIndex ? [] : {};
      }
      cursor = cursor[index] as Record<string, unknown> | unknown[];
    } else {
      if (Array.isArray(cursor)) return clone as T;
      const next = cursor[key];
      if (!next || typeof next !== 'object') {
        cursor[key] = nextIsIndex ? [] : {};
      }
      cursor = cursor[key] as Record<string, unknown> | unknown[];
    }
  }

  return clone as T;
}
