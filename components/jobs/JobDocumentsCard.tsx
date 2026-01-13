'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CollapsibleSection, Button, Input } from '@/components/ui';
import type { JobDocument } from '@/db/schema/job_documents';

type DraftLink = { title: string; url: string };
const EMPTY: DraftLink = { title: '', url: '' };

export default function JobDocumentsCard(props: { orgId: string; jobId: string }) {
  const [docs, setDocs] = useState<JobDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLink>(EMPTY);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-documents?orgId=${props.orgId}&jobId=${props.jobId}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to load documents');
      setDocs(json.data as JobDocument[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addLink = async () => {
    if (!draft.title.trim() || !draft.url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/job-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          jobId: props.jobId,
          title: draft.title.trim(),
          url: draft.url.trim(),
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to add link');
      setDraft(EMPTY);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add link');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File | null) => {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('orgId', props.orgId);
      form.set('jobId', props.jobId);
      form.set('file', file);
      const res = await fetch('/api/job-documents/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to upload document');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload document');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const remove = async (doc: JobDocument) => {
    if (!confirm(`Remove "${doc.title}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/job-documents?id=${doc.id}&orgId=${props.orgId}&jobId=${props.jobId}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to delete document');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete document');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsibleSection
      title="Plans & Documents"
      description="Upload files or attach links."
      defaultOpen={false}
      storageKey={`job-detail-${props.jobId}-documents`}
      actions={
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0] ?? null)}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={saving}>
            Upload
          </Button>
        </div>
      }
    >

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading documents...</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-text-secondary">No documents yet.</p>
      ) : (
        <div className="space-y-2 mb-6">
          {docs.map((d) => {
            const href = d.kind === 'file' ? d.storagePath : d.url;
            const label = d.kind === 'file' ? 'File' : 'Link';
            return (
              <div
                key={d.id}
                className="p-3 rounded-md border border-border-subtle bg-bg-section/30 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary truncate">{d.title}</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-border-subtle bg-bg-section/40 text-text-tertiary">
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-text-tertiary mt-1 truncate">{href || '-'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent-gold hover:text-accent-gold/80 transition-colors"
                    >
                      Open
                    </a>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => remove(d)} disabled={saving}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Add link</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="https://..."
            value={draft.url}
            onChange={(e) => setDraft((p) => ({ ...p, url: e.target.value }))}
            disabled={saving}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={addLink} disabled={saving || !draft.title.trim() || !draft.url.trim()}>
            {saving ? 'Saving...' : 'Add link'}
          </Button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
