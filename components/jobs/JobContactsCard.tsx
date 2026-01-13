'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CollapsibleSection, Button, Input } from '@/components/ui';
import type { JobContact } from '@/db/schema/job_contacts';

type DraftContact = {
  name: string;
  role: string;
  phone: string;
  email: string;
  notes: string;
};

const EMPTY: DraftContact = { name: '', role: '', phone: '', email: '', notes: '' };

export default function JobContactsCard(props: { orgId: string; jobId: string }) {
  const [contacts, setContacts] = useState<JobContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftContact>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editingContact = useMemo(() => contacts.find((c) => c.id === editingId) || null, [contacts, editingId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-contacts?orgId=${props.orgId}&jobId=${props.jobId}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to load contacts');
      setContacts(json.data as JobContact[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginCreate = () => {
    setEditingId(null);
    setDraft(EMPTY);
  };

  const beginEdit = (contact: JobContact) => {
    setEditingId(contact.id);
    setDraft({
      name: contact.name || '',
      role: contact.role || '',
      phone: contact.phone || '',
      email: contact.email || '',
      notes: contact.notes || '',
    });
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const res = await fetch('/api/job-contacts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            orgId: props.orgId,
            name: draft.name.trim(),
            role: draft.role.trim() || null,
            phone: draft.phone.trim() || null,
            email: draft.email.trim() || null,
            notes: draft.notes.trim() || null,
          }),
        });
        const json = await res.json();
        if (!json?.ok) throw new Error(json?.error?.message || 'Failed to update contact');
      } else {
        const res = await fetch('/api/job-contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: props.orgId,
            jobId: props.jobId,
            name: draft.name.trim(),
            role: draft.role.trim() || null,
            phone: draft.phone.trim() || null,
            email: draft.email.trim() || null,
            notes: draft.notes.trim() || null,
          }),
        });
        const json = await res.json();
        if (!json?.ok) throw new Error(json?.error?.message || 'Failed to create contact');
      }

      beginCreate();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (contact: JobContact) => {
    if (!confirm(`Delete contact "${contact.name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/job-contacts?id=${contact.id}&orgId=${props.orgId}&jobId=${props.jobId}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to delete contact');
      await load();
      if (editingId === contact.id) beginCreate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsibleSection
      title="Site Contacts"
      description="Add multiple contacts for site access and coordination."
      defaultOpen={false}
      storageKey={`job-detail-${props.jobId}-contacts`}
      actions={
        <Button variant="secondary" size="sm" onClick={beginCreate} disabled={saving}>
          New contact
        </Button>
      }
    >

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading contacts...</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-text-secondary">No contacts yet.</p>
      ) : (
        <div className="space-y-2 mb-6">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-md border border-border-subtle bg-bg-section/30 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {[c.role, c.phone, c.email].filter(Boolean).join(' | ') || '-'}
                </p>
                {c.notes && <p className="text-xs text-text-tertiary mt-1">{c.notes}</p>}
                {(c.phone || c.email) && (
                  <div className="mt-2 flex flex-wrap gap-2 md:hidden">
                    {c.phone && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const phone = c.phone?.replace(/\s+/g, '') ?? '';
                            if (phone) window.location.href = `tel:${phone}`;
                          }}
                        >
                          Call
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const phone = c.phone?.replace(/\s+/g, '') ?? '';
                            if (phone) window.location.href = `sms:${phone}`;
                          }}
                        >
                          Message
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => beginEdit(c)} disabled={saving}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(c)} disabled={saving}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          {editingContact ? `Edit contact` : 'Add contact'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            placeholder="Name"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="Role (optional)"
            value={draft.role}
            onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="Phone (optional)"
            value={draft.phone}
            onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="Email (optional)"
            value={draft.email}
            onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
            disabled={saving}
          />
        </div>
        <div className="mt-3">
          <Input
            placeholder="Notes (optional)"
            value={draft.notes}
            onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
            disabled={saving}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={save} disabled={saving || !draft.name.trim()}>
            {saving ? 'Saving...' : editingContact ? 'Save changes' : 'Add contact'}
          </Button>
          {editingContact && (
            <Button variant="secondary" onClick={beginCreate} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
