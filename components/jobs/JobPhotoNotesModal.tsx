'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { JobPhoto } from '@/db/schema/job_photos';
import { Card, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';

type PhotoNote = {
  id: string;
  x: number; // 0..1
  y: number; // 0..1
  text: string;
};

function makeId() {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `note_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseNotes(annotationJson: any): PhotoNote[] {
  const raw = annotationJson && typeof annotationJson === 'object' ? (annotationJson as any) : null;
  const notes = raw?.notes;
  if (!Array.isArray(notes)) return [];
  return notes
    .map((n: any) => ({
      id: typeof n?.id === 'string' ? n.id : makeId(),
      x: clamp01(Number(n?.x ?? 0.5)),
      y: clamp01(Number(n?.y ?? 0.5)),
      text: typeof n?.text === 'string' ? n.text : '',
    }))
    .filter((n: PhotoNote) => n.id && typeof n.text === 'string');
}

function buildAnnotationJson(existing: any, notes: PhotoNote[]) {
  const base = existing && typeof existing === 'object' ? existing : {};
  return { ...base, version: base?.version ?? 1, notes };
}

export default function JobPhotoNotesModal(props: {
  orgId: string;
  jobId: string;
  photo: JobPhoto;
  onClose: () => void;
  onSaved: (updated: JobPhoto) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string } | null>(null);
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(props.onClose, isMobile);

  const [notes, setNotes] = useState<PhotoNote[]>(() => parseNotes(props.photo.annotationJson));
  const [activeNoteId, setActiveNoteId] = useState<string | null>(notes[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => notes.find((n) => n.id === activeNoteId) || null, [notes, activeNoteId]);

  useEffect(() => {
    setNotes(parseNotes(props.photo.annotationJson));
  }, [props.photo.annotationJson, props.photo.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props]);

  const addNoteAtClientPoint = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    const id = makeId();
    const next: PhotoNote = { id, x, y, text: '' };
    setNotes((prev) => [next, ...prev]);
    setActiveNoteId(id);
  };

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setNotes((prev) => prev.map((n) => (n.id === drag.id ? { ...n, x, y } : n)));
  };

  const onPointerUp = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  const beginDrag = (id: string) => {
    dragRef.current = { id };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const removeNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setActiveNoteId((prev) => (prev === id ? null : prev));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/job-photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          jobId: props.jobId,
          id: props.photo.id,
          annotationJson: buildAnnotationJson(props.photo.annotationJson, notes),
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to save photo notes');
      props.onSaved(json.data as JobPhoto);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save photo notes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={props.onClose} />
      <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
        <Card
          className={cn(
            'w-full bg-bg-base border border-border-subtle',
            isMobile ? 'rounded-t-2xl max-h-[92vh] overflow-y-auto' : 'max-w-5xl rounded-lg'
          )}
          {...swipe}
        >
          <div className="p-4 md:p-6 space-y-4">
            {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-text-primary truncate">
                  Photo notes
                </h3>
                <p className="text-xs text-text-tertiary mt-1">
                  Click the image to add a note. Drag notes to reposition.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={props.onClose} disabled={saving}>
                  Close
                </Button>
                <Button variant="primary" onClick={save} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <div
                  ref={containerRef}
                  className="relative w-full rounded-md overflow-hidden border border-border-subtle bg-bg-section"
                  onClick={(e) => addNoteAtClientPoint(e.clientX, e.clientY)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={props.photo.storagePath}
                    alt={props.photo.originalFileName || 'Job photo'}
                    className="w-full h-auto block select-none"
                    draggable={false}
                  />

                  {notes.map((n, idx) => (
                    <div
                      key={n.id}
                      className={cn(
                        'absolute z-10 select-none',
                        'px-2 py-1 rounded-md text-[11px] font-medium',
                        'border border-accent-gold/60 bg-bg-base/90 text-text-primary',
                        n.id === activeNoteId ? 'ring-2 ring-accent-gold' : 'opacity-90 hover:opacity-100'
                      )}
                      style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%`, transform: 'translate(-50%, -50%)' }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveNoteId(n.id);
                        beginDrag(n.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveNoteId(n.id);
                      }}
                      title={n.text || 'Note'}
                    >
                      {n.text?.trim() ? n.text : `Note ${notes.length - idx}`}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">Notes</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      addNoteAtClientPoint(
                        window.innerWidth / 2,
                        window.innerHeight / 2
                      );
                    }}
                    disabled={saving}
                  >
                    Add note
                  </Button>
                </div>

                {notes.length === 0 ? (
                  <p className="text-sm text-text-secondary">No notes yet.</p>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          'p-3 rounded-md border bg-bg-section/30',
                          n.id === activeNoteId ? 'border-accent-gold/60' : 'border-border-subtle'
                        )}
                        onClick={() => setActiveNoteId(n.id)}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs text-text-tertiary truncate">
                            {n.id === activeNoteId ? 'Selected' : ' '}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNote(n.id);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                        <Input
                          placeholder="Type a note..."
                          value={n.text}
                          onChange={(e) =>
                            setNotes((prev) =>
                              prev.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x))
                            )
                          }
                          disabled={saving}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {active && (
                  <p className="text-xs text-text-tertiary">
                    Position: {Math.round(active.x * 100)}% / {Math.round(active.y * 100)}%
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
