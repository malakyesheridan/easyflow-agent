import { pdf } from '@react-pdf/renderer';

const SUPPORTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);

function resolveBaseUrl(origin?: string): string {
  if (origin) return origin;
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function toAbsoluteUrl(input: string, origin?: string): string {
  if (/^(data:|https?:\/\/)/i.test(input)) return input;
  if (input.startsWith('/')) {
    const base = resolveBaseUrl(origin).replace(/\/$/, '');
    return `${base}${input}`;
  }
  return input;
}

function guessContentType(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

async function streamToBytes(stream: any): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
      chunks.push(chunk);
      total += chunk.length;
    }
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

export async function renderPdfToBuffer(doc: JSX.Element): Promise<ArrayBuffer> {
  const output = await pdf(doc).toBuffer();
  if (output instanceof Uint8Array) return toArrayBuffer(output);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(output)) return toArrayBuffer(output);
  if (output && typeof (output as any).getReader === 'function') {
    const bytes = await streamToBytes(output as any);
    return toArrayBuffer(bytes);
  }
  if (output && typeof (output as any).byteLength === 'number') {
    const bytes = new Uint8Array(output as any);
    return toArrayBuffer(bytes);
  }
  return new ArrayBuffer(0);
}

export async function resolvePdfImageDataUrl(input: string | null, origin?: string): Promise<string | null> {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return trimmed;

  const url = toAbsoluteUrl(trimmed, origin);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const headerType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const contentType = headerType || guessContentType(url) || '';
    if (!contentType || !SUPPORTED_IMAGE_MIME.has(contentType)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}
