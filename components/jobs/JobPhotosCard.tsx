'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CollapsibleSection, Button } from '@/components/ui';
import type { JobPhoto } from '@/db/schema/job_photos';
import JobPhotoNotesModal from '@/components/jobs/JobPhotoNotesModal';
import useIsMobile from '@/hooks/useIsMobile';

export default function JobPhotosCard(props: { orgId: string; jobId: string }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobile();
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [forceOpen, setForceOpen] = useState(false);

  const editingPhoto = useMemo(
    () => photos.find((p) => p.id === editingPhotoId) || null,
    [photos, editingPhotoId]
  );

  const getNoteCount = (photo: JobPhoto) => {
    const raw = photo.annotationJson && typeof photo.annotationJson === 'object' ? (photo.annotationJson as any) : null;
    const notes = raw?.notes;
    return Array.isArray(notes) ? notes.length : 0;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-photos?orgId=${props.orgId}&jobId=${props.jobId}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to load photos');
      setPhotos(json.data as JobPhoto[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('orgId', props.orgId);
      form.set('jobId', props.jobId);
      form.set('file', file);

      const res = await fetch('/api/job-photos/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to upload photo');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const uploadMany = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      // eslint-disable-next-line no-await-in-loop
      await upload(file);
    }
  };

  const uploadPending = async () => {
    if (!pendingFile) return;
    await upload(pendingFile);
    setPendingFile(null);
  };

  const remove = async (photo: JobPhoto) => {
    if (!confirm('Delete this photo?')) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/job-photos?id=${photo.id}&orgId=${props.orgId}&jobId=${props.jobId}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to delete photo');
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete photo');
    }
  };

  const summary = loading
    ? 'Loading photos...'
    : photos.length === 1
      ? '1 photo uploaded'
      : `${photos.length} photos uploaded`;

  return (
    <CollapsibleSection
      title="Photos"
      description="Upload site photos and job documentation. Add notes directly on photos."
      summary={summary}
      defaultOpen={false}
      storageKey={`job-detail-${props.jobId}-photos`}
      forceOpen={forceOpen}
      actions={
        <div className="inline-flex items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture={isMobile ? 'environment' : undefined}
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              if (isMobile) {
                setForceOpen(true);
                setPendingFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = '';
                return;
              }
              void uploadMany(e.target.files);
              e.currentTarget.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => {
              setForceOpen(true);
              fileInputRef.current?.click();
            }}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      }
    >

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && isMobile ? (
        <div className="space-y-2 md:hidden">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-bg-section/70 animate-pulse" />
          ))}
        </div>
      ) : loading ? (
        <p className="text-sm text-text-secondary">Loading photos...</p>
      ) : (
        <>
          {pendingPreview && (
            <div className="md:hidden rounded-xl border border-border-subtle overflow-hidden bg-bg-section/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingPreview} alt="Pending upload" className="w-full h-auto" />
              <div className="p-3 flex items-center gap-2">
                <Button variant="primary" size="sm" disabled={uploading} onClick={() => void uploadPending()}>
                  {uploading ? 'Uploading...' : 'Save photo'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={() => setPendingFile(null)}
                >
                  Discard
                </Button>
              </div>
            </div>
          )}
          {photos.length === 0 ? (
            <p className="text-sm text-text-secondary">No photos yet.</p>
          ) : (
            <>
          <div className="md:hidden -mx-4 px-4">
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2">
              {photos.map((p) => (
                <div key={p.id} className="min-w-[85%] snap-start">
                  <div className="border border-border-subtle rounded-xl overflow-hidden bg-bg-section/30">
                    <div className="aspect-[4/3] bg-bg-base">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.storagePath}
                        alt={p.originalFileName || 'Job photo'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-xs text-text-tertiary truncate">
                        {p.originalFileName || 'Photo'}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setEditingPhotoId(p.id)}>
                          Notes{getNoteCount(p) > 0 ? ` (${getNoteCount(p)})` : ''}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void remove(p)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden md:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="border border-border-subtle rounded-md overflow-hidden bg-bg-section/30">
                <div className="aspect-square bg-bg-base">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.storagePath}
                    alt={p.originalFileName || 'Job photo'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="p-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-text-tertiary truncate flex-1">
                    {p.originalFileName || 'Photo'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingPhotoId(p.id)}>
                      Notes{getNoteCount(p) > 0 ? ` (${getNoteCount(p)})` : ''}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(p)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
            </>
          )}
        </>
      )}

      {editingPhoto && (
        <JobPhotoNotesModal
          orgId={props.orgId}
          jobId={props.jobId}
          photo={editingPhoto}
          onClose={() => setEditingPhotoId(null)}
          onSaved={(updated) => {
            setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setEditingPhotoId(null);
          }}
        />
      )}
    </CollapsibleSection>
  );
}
