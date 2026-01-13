import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${ITERATIONS}:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [iterRaw, salt, hash] = stored.split(':');
  const iterations = Number(iterRaw);
  if (!iterations || !salt || !hash) return false;
  const derived = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
