"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Input, Button } from '@/components/ui';

type ClientRow = {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
};

export default function ClientsView({ orgId, basePath = '/clients' }: { orgId: string; basePath?: string }) {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const timeoutId = setTimeout(() => {
      fetch(`/api/clients?orgId=${orgId}&q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (!data?.ok) {
            setClients([]);
            setError(data?.error?.message || 'Failed to load clients');
            return;
          }
          const rows = (data.data ?? []).map((row: any) => ({
            id: String(row.id),
            displayName: String(row.displayName),
            email: row.email ?? null,
            phone: row.phone ?? null,
          }));
          setClients(rows);
        })
        .catch(() => {
          if (!active) return;
          setClients([]);
          setError('Failed to load clients');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [orgId, query]);

  const hasClients = clients.length > 0;
  const emptyState = useMemo(() => {
    if (loading) return 'Loading clients...';
    if (error) return error;
    if (query.trim()) return 'No clients match your search.';
    return 'No clients created yet.';
  }, [loading, error, query]);

  const openCreateModal = () => {
    setCreateError(null);
    setCreateName(query.trim());
    setCreateEmail('');
    setCreatePhone('');
    setCreateOpen(true);
  };

  const openEditModal = (client: ClientRow) => {
    setEditError(null);
    setEditClientId(client.id);
    setEditName(client.displayName);
    setEditEmail(client.email ?? '');
    setEditPhone(client.phone ?? '');
    setEditOpen(true);
  };

  const createClient = async () => {
    if (!createName.trim()) {
      setCreateError('Client name is required.');
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          displayName: createName.trim(),
          email: createEmail.trim() || null,
          phone: createPhone.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to create client');
      setCreateOpen(false);
      setQuery('');
      setClients((prev) => [
        {
          id: String(json.data.id),
          displayName: String(json.data.displayName),
          email: json.data.email ?? null,
          phone: json.data.phone ?? null,
        },
        ...prev,
      ]);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setCreateSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editClientId) return;
    if (!editName.trim()) {
      setEditError('Client name is required.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/clients/${editClientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          displayName: editName.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to update client');
      setClients((prev) =>
        prev.map((row) =>
          row.id === editClientId
            ? {
                ...row,
                displayName: json.data.displayName ?? editName.trim(),
                email: json.data.email ?? null,
                phone: json.data.phone ?? null,
              }
            : row
        )
      );
      setEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update client');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          label="Search clients"
          placeholder="Search by name, email, or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button onClick={openCreateModal}>Create client</Button>
      </div>

      <Card className="p-0">
        {!hasClients ? (
          <div className="px-6 py-8 text-sm text-text-tertiary">{emptyState}</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {clients.map((client) => (
              <div key={client.id} className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{client.displayName}</p>
                  {(client.email || client.phone) && (
                    <p className="text-xs text-text-tertiary mt-1">
                      {[client.email, client.phone].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(client)}>
                    Edit
                  </Button>
                  <Link href={`${basePath}/${client.id}`}>
                    <Button variant="secondary" size="sm">
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !createSaving && setCreateOpen(false)} />
          <Card className="relative w-full max-w-lg mx-4 p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Create client</h2>
                <p className="text-sm text-text-tertiary">Save this client for future jobs.</p>
              </div>
              {createError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {createError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Display name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  disabled={createSaving}
                />
                <Input
                  label="Email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  disabled={createSaving}
                />
                <Input
                  label="Phone"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  disabled={createSaving}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createSaving}>
                  Cancel
                </Button>
                <Button onClick={createClient} disabled={createSaving}>
                  {createSaving ? 'Saving...' : 'Create client'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !editSaving && setEditOpen(false)} />
          <Card className="relative w-full max-w-lg mx-4 p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Edit client</h2>
                <p className="text-sm text-text-tertiary">Update client details.</p>
              </div>
              {editError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {editError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Display name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={editSaving}
                />
                <Input
                  label="Email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  disabled={editSaving}
                />
                <Input
                  label="Phone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  disabled={editSaving}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={editSaving}>
                  Cancel
                </Button>
                <Button onClick={saveEdit} disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
