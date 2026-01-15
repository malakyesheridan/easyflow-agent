'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Select } from '@/components/ui';
import { useOrgConfig } from '@/hooks/useOrgConfig';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'under_offer', label: 'Under offer' },
  { value: 'sold', label: 'Sold' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

type ContactOption = {
  id: string;
  fullName: string;
  role: string;
};

type ContactsResponse = {
  data: ContactOption[];
  total: number;
};

function toDateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function ListingCreateView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';
  const router = useRouter();

  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    vendorContactId: '',
    address: '',
    suburb: '',
    status: 'draft',
    listedAt: '',
    priceGuideMin: '',
    priceGuideMax: '',
    propertyType: '',
    beds: '',
    baths: '',
    cars: '',
  });

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const loadContacts = async () => {
      try {
        const res = await fetch(`/api/contacts?orgId=${orgId}&pageSize=200`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load contacts');
        const payload = json.data as ContactsResponse;
        if (!cancelled) setContacts(payload.data ?? []);
      } catch {
        if (!cancelled) setContacts([]);
      }
    };

    void loadContacts();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleSubmit = async () => {
    if (!orgId) return;
    if (!form.vendorContactId || !form.address || !form.suburb) {
      setError('Vendor, address, and suburb are required.');
      return;
    }

    setLoading(true);
    setError(null);
    const listedAt = form.listedAt ? new Date(form.listedAt) : null;
    if (listedAt && Number.isNaN(listedAt.getTime())) {
      setError('Invalid listed date');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          vendorContactId: form.vendorContactId,
          address: form.address,
          suburb: form.suburb,
          status: form.status,
          listedAt: listedAt ? listedAt.toISOString() : undefined,
          priceGuideMin: form.priceGuideMin ? Number(form.priceGuideMin) : undefined,
          priceGuideMax: form.priceGuideMax ? Number(form.priceGuideMax) : undefined,
          propertyType: form.propertyType || undefined,
          beds: form.beds ? Number(form.beds) : undefined,
          baths: form.baths ? Number(form.baths) : undefined,
          cars: form.cars ? Number(form.cars) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to create listing');
      if (json.data?.id) {
        router.push(`/listings/${json.data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Select
        label="Vendor contact"
        value={form.vendorContactId}
        onChange={(event) => setForm((prev) => ({ ...prev, vendorContactId: event.target.value }))}
      >
        <option value="">Select a contact</option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.fullName} {contact.role !== 'unknown' ? `(${contact.role})` : ''}
          </option>
        ))}
      </Select>
      <Input
        label="Address"
        value={form.address}
        onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
        placeholder="123 Main St"
      />
      <Input
        label="Suburb"
        value={form.suburb}
        onChange={(event) => setForm((prev) => ({ ...prev, suburb: event.target.value }))}
        placeholder="Bondi"
      />
      <Select
        label="Status"
        value={form.status}
        onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Input
        label="Listed date"
        type="date"
        value={toDateInput(form.listedAt)}
        onChange={(event) => setForm((prev) => ({ ...prev, listedAt: event.target.value }))}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input
          label="Price guide min"
          type="number"
          value={form.priceGuideMin}
          onChange={(event) => setForm((prev) => ({ ...prev, priceGuideMin: event.target.value }))}
        />
        <Input
          label="Price guide max"
          type="number"
          value={form.priceGuideMax}
          onChange={(event) => setForm((prev) => ({ ...prev, priceGuideMax: event.target.value }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Input
          label="Property type"
          value={form.propertyType}
          onChange={(event) => setForm((prev) => ({ ...prev, propertyType: event.target.value }))}
          placeholder="House"
        />
        <Input
          label="Beds"
          type="number"
          value={form.beds}
          onChange={(event) => setForm((prev) => ({ ...prev, beds: event.target.value }))}
        />
        <Input
          label="Baths"
          type="number"
          value={form.baths}
          onChange={(event) => setForm((prev) => ({ ...prev, baths: event.target.value }))}
        />
        <Input
          label="Cars"
          type="number"
          value={form.cars}
          onChange={(event) => setForm((prev) => ({ ...prev, cars: event.target.value }))}
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Create listing'}
        </Button>
      </div>
    </Card>
  );
}
