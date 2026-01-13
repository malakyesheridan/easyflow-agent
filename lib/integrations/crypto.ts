import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const CREDENTIALS_KEY_ENV = 'INTEGRATION_CREDENTIALS_KEY';
const CREDENTIALS_VERSION = 1;

export type EncryptedCredentials = {
  v: number;
  iv: string;
  tag: string;
  data: string;
};

function loadKey(): Buffer {
  const raw = process.env[CREDENTIALS_KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(`${CREDENTIALS_KEY_ENV} is not set`);
  }

  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== 32) {
    throw new Error(`${CREDENTIALS_KEY_ENV} must be a 32-byte key (hex or base64).`);
  }

  return key;
}

export function encryptCredentials(credentials: Record<string, string>): EncryptedCredentials {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const payload = JSON.stringify(credentials ?? {});
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: CREDENTIALS_VERSION,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptCredentials(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Encrypted credentials payload is invalid.');
  }

  const record = payload as Partial<EncryptedCredentials>;
  if (!record.iv || !record.tag || !record.data || typeof record.v !== 'number') {
    throw new Error('Encrypted credentials payload is missing fields.');
  }

  if (record.v !== CREDENTIALS_VERSION) {
    throw new Error(`Unsupported credentials version: ${record.v}`);
  }

  const key = loadKey();
  const iv = Buffer.from(record.iv, 'base64');
  const tag = Buffer.from(record.tag, 'base64');
  const encrypted = Buffer.from(record.data, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(decrypted) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Decrypted credentials are malformed.');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const normalized: Record<string, string> = {};
  for (const [keyName, value] of entries) {
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      throw new Error(`Credential ${keyName} must be a string.`);
    }
    normalized[keyName] = value;
  }

  return normalized;
}
