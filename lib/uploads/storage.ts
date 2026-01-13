import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

type StorageResult = {
  storagePath: string;
};

function safeExt(filename: string, fallback: string) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext && ext.length <= 10) return ext;
  return fallback;
}

function getSupabaseAdmin(): { client: SupabaseClient; bucket: string } | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();

  if (!url || !serviceKey || !bucket) return null;
  return {
    client: createClient(url, serviceKey, {
      auth: { persistSession: false },
    }),
    bucket,
  };
}

function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
}

export async function storeUpload(params: {
  orgId: string;
  /**
   * Used only for foldering; do not assume job-scoped uploads always exist.
   */
  jobId?: string;
  namespace: 'job-photos' | 'job-documents' | 'org-branding';
  file: File;
}): Promise<StorageResult> {
  const id = crypto.randomUUID();
  const ext = safeExt(params.file.name, '.bin');

  const subdir = params.jobId
    ? `${params.namespace}/${params.orgId}/${params.jobId}`
    : `${params.namespace}/${params.orgId}`;
  const objectKey = `${subdir}/${id}${ext}`;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const buf = Buffer.from(await params.file.arrayBuffer());
    const { error } = await supabase.client.storage
      .from(supabase.bucket)
      .upload(objectKey, buf, {
        contentType: params.file.type || undefined,
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    const publicUrl = supabase.client.storage
      .from(supabase.bucket)
      .getPublicUrl(objectKey).data.publicUrl;

    return { storagePath: publicUrl };
  }

  // Local filesystem fallback for dev only.
  if (isVercelRuntime()) {
    throw new Error(
      'Uploads are not configured for production. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.'
    );
  }

  const storagePath = `/uploads/${params.orgId}/${params.jobId ? `${params.jobId}/` : ''}${id}${ext}`;
  const fullPath = path.join(process.cwd(), 'public', storagePath);

  await mkdir(path.dirname(fullPath), { recursive: true });
  const buf = Buffer.from(await params.file.arrayBuffer());
  await writeFile(fullPath, buf);

  return { storagePath };
}

export async function deleteUploadIfPossible(storagePath: string): Promise<void> {
  // Local dev cleanup remains handled by routes (unlink under /public).
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  // Parse public URL form:
  // https://<project>.supabase.co/storage/v1/object/public/<bucket>/<key>
  const marker = '/storage/v1/object/public/';
  const idx = storagePath.indexOf(marker);
  if (idx === -1) return;

  const rest = storagePath.slice(idx + marker.length);
  const [bucket, ...keyParts] = rest.split('/');
  const key = keyParts.join('/');
  if (!bucket || !key) return;

  await supabase.client.storage.from(bucket).remove([key]);
}

