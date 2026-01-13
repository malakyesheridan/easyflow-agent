import { createHash, randomBytes } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSecureToken(bytes = 32): { token: string; tokenHash: string } {
  const token = randomBytes(bytes).toString('hex');
  return { token, tokenHash: hashToken(token) };
}
