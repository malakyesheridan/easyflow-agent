'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Chip, GlassCard, Input, MetricCard, PageHeader, SectionHeader, Select } from '@/components/ui';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { cn } from '@/lib/utils';

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'seller', label: 'Seller' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'both', label: 'Both' },
  { value: 'unknown', label: 'Unknown' },
];

const SORT_OPTIONS = [
  { value: 'next_touch_at_asc', label: 'Next touch (soonest)' },
  { value: 'last_touch_at_desc', label: 'Last touch (recent)' },
  { value: 'created_at_desc', label: 'Recently added' },
];

type Tag = { id: string; name: string; color: string | null };

type Owner = { id: string; name: string | null; email: string | null };

type ContactRow = {
  id: string;
  fullName: string;
  role: string;
  sellerStage: string | null;
  tags: Tag[];
  lastTouchAt: string | null;
  nextTouchAt: string | null;
  owner: Owner | null;
  email: string | null;
  phone: string | null;
};

type ContactsResponse = {
  data: ContactRow[];
  page: number;
  pageSize: number;
  total: number;
};

const SAVED_VIEWS = [
  { key: 'overdue', label: 'Overdue follow-ups' },
  { key: 'hot', label: 'Hot potential sellers' },
  { key: 'past', label: 'Past clients' },
];

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < new Date().setHours(0, 0, 0, 0);
}

function isDueToday(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export default function ContactsView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [role, setRole] = useState('');
  const [sellerStage, setSellerStage] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [dueToday, setDueToday] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState('next_touch_at_asc');

  const [owners, setOwners] = useState<Owner[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTags, setBulkTags] = useState('');
  const [bulkStage, setBulkStage] = useState('');
  const [bulkOwnerId, setBulkOwnerId] = useState('');
  const [bulkNextTouch, setBulkNextTouch] = useState('');
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'unknown',
    sellerStage: '',
    tags: '',
    nextTouchAt: '',
    ownerUserId: '',
    leadSource: '',
  });

  const summary = useMemo(() => {
    const overdue = contacts.filter((contact) => isOverdue(contact.nextTouchAt)).length;
    const dueTodayCount = contacts.filter((contact) => isDueToday(contact.nextTouchAt)).length;
    return { overdue, dueTodayCount };
  }, [contacts]);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/tags?orgId=${orgId}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load tags');
        if (!cancelled) setTags(json.data ?? []);
      } catch {
        if (!cancelled) setTags([]);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const loadOwners = async () => {
      try {
        const res = await fetch(`/api/contacts/owners?orgId=${orgId}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load owners');
        if (!cancelled) setOwners(json.data ?? []);
      } catch {
        if (!cancelled) setOwners([]);
      }
    };

    void loadOwners();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (!orgId) return params.toString();
    params.set('orgId', orgId);
    if (search) params.set('q', search);
    if (ownerId) params.set('ownerId', ownerId);
    if (role) params.set('role', role);
    if (sellerStage) params.set('sellerStage', sellerStage);
    if (leadSource) params.set('leadSource', leadSource);
    if (tagFilter) params.append('tag', tagFilter);
    if (dueToday) params.set('dueToday', 'true');
    if (overdueOnly) params.set('overdue', 'true');
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('pageSize', '50');
    return params.toString();
  }, [orgId, search, ownerId, role, sellerStage, leadSource, tagFilter, dueToday, overdueOnly, sort, page]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/contacts?${queryString}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load contacts');
        const payload = json.data as ContactsResponse;
        if (!cancelled) {
          setContacts(payload.data ?? []);
          setTotal(payload.total ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setContacts([]);
          setTotal(0);
          setError(err instanceof Error ? err.message : 'Failed to load contacts');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, queryString]);

  const toggleSelection = (contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(contacts.map((contact) => contact.id)));
  };

  const applySavedView = (key: string) => {
    setPage(1);
    setDueToday(false);
    setOverdueOnly(false);
    setRole('');
    setSellerStage('');
    setTagFilter('');

    if (key === 'overdue') {
      setOverdueOnly(true);
    }
    if (key === 'hot') {
      setRole('seller');
      setSellerStage('hot');
    }
    if (key === 'past') {
      setTagFilter('Past Client');
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setOwnerId('');
    setRole('');
    setSellerStage('');
    setTagFilter('');
    setLeadSource('');
    setDueToday(false);
    setOverdueOnly(false);
    setSort('next_touch_at_asc');
    setPage(1);
  };

  const handleBulkAction = async (action: string, payload: Record<string, unknown>) => {
    if (selectedIds.size === 0 || !orgId) return;
    setBulkMessage(null);
    try {
      const res = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          contactIds: Array.from(selectedIds),
          action,
          payload,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Bulk update failed');
      setBulkMessage('Bulk update complete.');
      setSelectedIds(new Set());
      setBulkTags('');
      setBulkStage('');
      setBulkOwnerId('');
      setBulkNextTouch('');
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : 'Bulk update failed');
    }
  };

  const submitCreate = async () => {
    if (!orgId) return;
    setCreateLoading(true);
    setCreateError(null);
    const nextTouchDate = createForm.nextTouchAt ? new Date(createForm.nextTouchAt) : null;
    const nextTouchAt = nextTouchDate && !Number.isNaN(nextTouchDate.getTime())
      ? nextTouchDate.toISOString()
      : undefined;
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          fullName: createForm.fullName,
          email: createForm.email || undefined,
          phone: createForm.phone || undefined,
          role: createForm.role || undefined,
          sellerStage: createForm.sellerStage || undefined,
          leadSource: createForm.leadSource || undefined,
          ownerUserId: createForm.ownerUserId || undefined,
          nextTouchAt,
          tags: createForm.tags
            ? createForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to create contact');
      setShowCreate(false);
      setCreateForm({
        fullName: '',
        email: '',
        phone: '',
        role: 'unknown',
        sellerStage: '',
        tags: '',
        nextTouchAt: '',
        ownerUserId: '',
        leadSource: '',
      });
      setPage(1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create contact');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        subtitle="Nurture your seller database and track every touchpoint."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowCreate((prev) => !prev)}>
              Add contact
            </Button>
            <Link href="/contacts/import">
              <Button variant="ghost">Import CSV</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard
          label="Total contacts"
          value={total}
          helper="Across the database"
        />
        <MetricCard
          label="Due today"
          value={summary.dueTodayCount}
          helper="Visible in this view"
        />
        <MetricCard
          label="Overdue"
          value={summary.overdue}
          helper="Visible in this view"
        />
      </div>

      {showCreate && (
        <GlassCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">New contact</p>
              <p className="text-xs text-text-tertiary">Add a seller or nurture contact.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Close
            </Button>
          </div>
          {createError && <p className="text-sm text-destructive">{createError}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Full name"
              value={createForm.fullName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Jordan Mason"
            />
            <Select
              label="Role"
              value={createForm.role}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value }))}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              label="Email"
              value={createForm.email}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="seller@email.com"
            />
            <Input
              label="Phone"
              value={createForm.phone}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="0400 000 000"
            />
            <Input
              label="Seller stage"
              value={createForm.sellerStage}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, sellerStage: event.target.value }))}
              placeholder="Hot"
            />
            <Input
              label="Lead source"
              value={createForm.leadSource}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, leadSource: event.target.value }))}
              placeholder="Referral"
            />
            <Input
              label="Tags"
              value={createForm.tags}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="Past client, Vendor"
            />
            <Input
              label="Next follow-up"
              type="date"
              value={createForm.nextTouchAt}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, nextTouchAt: event.target.value }))}
            />
            <Select
              label="Owner"
              value={createForm.ownerUserId}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
            >
              <option value="">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name || owner.email || owner.id}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end">
            <Button onClick={submitCreate} disabled={createLoading}>
              {createLoading ? 'Saving...' : 'Save contact'}
            </Button>
          </div>
        </GlassCard>
      )}

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {SAVED_VIEWS.map((view) => (
              <Chip key={view.key} onClick={() => applySavedView(view.key)}>
                {view.label}
              </Chip>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Reset filters
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Name, email, phone, address"
          />
          <Select
            label="Owner"
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
          >
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name || owner.email || owner.id}
              </option>
            ))}
          </Select>
          <Select label="Role" value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            label="Seller stage"
            value={sellerStage}
            onChange={(event) => setSellerStage(event.target.value)}
            placeholder="Hot, Warm, Cold"
          />
          <Select
            label="Tag"
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </Select>
          <Input
            label="Lead source"
            value={leadSource}
            onChange={(event) => setLeadSource(event.target.value)}
            placeholder="Referral"
          />
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={dueToday}
                onChange={(event) => setDueToday(event.target.checked)}
              />
              Due today
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => setOverdueOnly(event.target.checked)}
              />
              Overdue
            </label>
          </div>
          <Select
            label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </GlassCard>

      {selectedIds.size > 0 && (
        <GlassCard className="space-y-3 border border-border-subtle bg-bg-section/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">{selectedIds.size} contacts selected</p>
            {bulkMessage && <p className="text-xs text-text-tertiary">{bulkMessage}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              label="Tags"
              value={bulkTags}
              onChange={(event) => setBulkTags(event.target.value)}
              placeholder="Comma-separated tags"
            />
            <Input
              label="Seller stage"
              value={bulkStage}
              onChange={(event) => setBulkStage(event.target.value)}
              placeholder="Warm"
            />
            <Select
              label="Owner"
              value={bulkOwnerId}
              onChange={(event) => setBulkOwnerId(event.target.value)}
            >
              <option value="">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name || owner.email || owner.id}
                </option>
              ))}
            </Select>
            <Input
              label="Next follow-up"
              type="date"
              value={bulkNextTouch}
              onChange={(event) => setBulkNextTouch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                handleBulkAction('add_tags', {
                  tags: bulkTags.split(',').map((tag) => tag.trim()).filter(Boolean),
                })
              }
            >
              Add tags
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                handleBulkAction('remove_tags', {
                  tags: bulkTags.split(',').map((tag) => tag.trim()).filter(Boolean),
                })
              }
            >
              Remove tags
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleBulkAction('set_stage', { sellerStage: bulkStage })}
            >
              Set stage
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleBulkAction('assign_owner', { ownerUserId: bulkOwnerId })}
            >
              Assign owner
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleBulkAction('set_next_touch', { nextTouchAt: bulkNextTouch })}
            >
              Set follow-up
            </Button>
          </div>
        </GlassCard>
      )}

      <GlassCard className="overflow-hidden" padding="none">
        <div className="border-b border-border-subtle px-4 py-3">
          <SectionHeader
            title="Contacts"
            subtitle={`${total} contacts`}
            actions={error ? <p className="text-xs text-destructive">{error}</p> : undefined}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-text-tertiary bg-bg-section/30">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selectedIds.size === contacts.length}
                    onChange={(event) => toggleSelectAll(event.target.checked)}
                  />
                </th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Seller stage</th>
                <th className="px-4 py-3 text-left">Tags</th>
                <th className="px-4 py-3 text-left">Last touch</th>
                <th className="px-4 py-3 text-left">Next touch</th>
                <th className="px-4 py-3 text-left">Owner</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={8}>
                    Loading contacts...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={8}>
                    No contacts match these filters.
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => {
                  const overdue = isOverdue(contact.nextTouchAt);
                  return (
                    <tr key={contact.id} className="border-b border-border-subtle/60">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleSelection(contact.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${contact.id}`} className="font-medium text-text-primary hover:underline">
                          {contact.fullName}
                        </Link>
                        <div className="text-xs text-text-tertiary">
                          {[contact.email, contact.phone].filter(Boolean).join(' | ') || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="muted">{contact.role}</Badge>
                      </td>
                      <td className="px-4 py-3">{contact.sellerStage || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.length === 0
                            ? '-'
                            : contact.tags.map((tag) => (
                                <Badge key={tag.id} variant="muted">
                                  {tag.name}
                                </Badge>
                              ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatDate(contact.lastTouchAt)}</td>
                      <td className="px-4 py-3">
                        <span className={cn(overdue && 'text-red-500 font-semibold')}>
                          {formatDate(contact.nextTouchAt)}
                        </span>
                        {overdue && <span className="ml-2 text-xs text-red-500">Overdue</span>}
                      </td>
                      <td className="px-4 py-3">
                        {contact.owner?.name || contact.owner?.email || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs text-text-tertiary">
            Page {page} of {Math.max(1, Math.ceil(total / 50))}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={page >= Math.ceil(total / 50)}
            >
              Next
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
