"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Button, Card } from '@/components/ui';

type ClientOption = {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
};

type ClientSelectFieldProps = {
  orgId: string;
  value: string | null;
  onChange: (clientId: string | null, client?: ClientOption | null) => void;
  canManage: boolean;
  label?: string;
};

export default function ClientSelectField({
  orgId,
  value,
  onChange,
  canManage,
  label = 'Client',
}: ClientSelectFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  useEffect(() => {
    if (!canManage || !value) return;
    let active = true;
    fetch(`/api/clients/${value}?orgId=${orgId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const client = data?.ok ? data.data?.client : null;
        if (client?.id) {
          const option = {
            id: String(client.id),
            displayName: String(client.displayName),
            email: client.email ?? null,
            phone: client.phone ?? null,
          };
          setSelectedClient(option);
          setQuery(option.displayName);
        }
      })
      .catch(() => {
        if (!active) return;
        setSelectedClient(null);
      });
    return () => {
      active = false;
    };
  }, [value, orgId, canManage]);

  useEffect(() => {
    if (!canManage || !open) return;
    const term = query.trim();
    setLoading(true);
    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams();
      if (orgId) params.set('orgId', orgId);
      if (term) params.set('q', term);
      const queryString = params.toString();
      const url = queryString ? `/api/clients?${queryString}` : '/api/clients';
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (!data?.ok) {
            setOptions([]);
            return;
          }
          const rows = (data.data ?? []).map((row: any) => ({
            id: String(row.id),
            displayName: String(row.displayName),
            email: row.email ?? null,
            phone: row.phone ?? null,
          }));
          setOptions(rows);
        })
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, term ? 250 : 0);

    return () => clearTimeout(timeoutId);
  }, [query, orgId, canManage, open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const hasMatches = options.length > 0;
  const showCreateAction = query.trim().length > 0;

  const selectClient = (client: ClientOption) => {
    setSelectedClient(client);
    setQuery(client.displayName);
    setOpen(false);
    onChange(client.id, client);
  };

  const clearSelection = () => {
    setSelectedClient(null);
    setQuery('');
    setOptions([]);
    onChange(null, null);
  };

  const openCreateModal = () => {
    setCreateError(null);
    setCreateName(query.trim());
    setCreateEmail('');
    setCreatePhone('');
    setCreateOpen(true);
    setOpen(false);
  };

  const saveClient = async () => {
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
      if (!json?.ok) {
        throw new Error(json?.error?.message || 'Failed to create client');
      }
      const client = json.data;
      const option = {
        id: String(client.id),
        displayName: String(client.displayName),
        email: client.email ?? null,
        phone: client.phone ?? null,
      };
      setSelectedClient(option);
      setQuery(option.displayName);
      setCreateOpen(false);
      onChange(option.id, option);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create client');
    } finally {
      setCreateSaving(false);
    }
  };

  const helperText = useMemo(() => {
    if (!canManage) return null;
    if (selectedClient) return selectedClient.email || selectedClient.phone || null;
    return null;
  }, [selectedClient, canManage]);

  if (!canManage) return null;

  return (
    <>
      <div className="relative" ref={containerRef}>
        <Input
          label={label}
          value={query}
          placeholder="Search clients..."
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (selectedClient && next.trim() !== selectedClient.displayName) {
              setSelectedClient(null);
              onChange(null, null);
            }
            if (!next.trim()) {
              clearSelection();
            }
          }}
          onFocus={() => setOpen(true)}
        />
        {helperText && <p className="mt-1 text-xs text-text-tertiary">{helperText}</p>}

        {open && (
          <div className="absolute z-20 mt-2 w-full rounded-md border border-border-subtle bg-bg-base shadow-lg">
            <div className="max-h-56 overflow-y-auto">
              {loading && (
                <div className="px-3 py-2 text-xs text-text-tertiary">Searching...</div>
              )}
              {!loading && !hasMatches && (
                <div className="px-3 py-2 text-xs text-text-tertiary">No clients found.</div>
              )}
              {!loading &&
                options.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => selectClient(client)}
                    className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-section/60"
                  >
                    <div className="font-medium">{client.displayName}</div>
                    {(client.email || client.phone) && (
                      <div className="text-xs text-text-tertiary">
                        {[client.email, client.phone].filter(Boolean).join(' • ')}
                      </div>
                    )}
                  </button>
                ))}
            </div>
            <div className="border-t border-border-subtle px-3 py-2">
              {selectedClient && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear selection
                </Button>
              )}
              {showCreateAction && (
                <Button variant="secondary" size="sm" onClick={openCreateModal}>
                  Create new client
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

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
                <Button onClick={saveClient} disabled={createSaving}>
                  {createSaving ? 'Saving...' : 'Create client'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
