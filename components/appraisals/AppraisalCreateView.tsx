'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Textarea } from '@/components/ui';
import { useOrgConfig } from '@/hooks/useOrgConfig';

const MEETING_TYPES = [
  { value: 'in_person', label: 'In person' },
  { value: 'phone', label: 'Phone' },
  { value: 'video', label: 'Video' },
];

type ContactOption = {
  id: string;
  fullName: string;
  address: string | null;
  suburb: string | null;
};

type ContactsResponse = {
  data: ContactOption[];
  total: number;
};

export default function AppraisalCreateView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';
  const router = useRouter();

  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    contactId: '',
    appointmentAt: '',
    meetingType: 'in_person',
    address: '',
    suburb: '',
    notes: '',
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

  const handleContactChange = (contactId: string) => {
    const selected = contacts.find((contact) => contact.id === contactId);
    setForm((prev) => ({
      ...prev,
      contactId,
      address: selected?.address ?? prev.address,
      suburb: selected?.suburb ?? prev.suburb,
    }));
  };

  const handleSubmit = async () => {
    if (!orgId) return;
    if (!form.contactId || !form.appointmentAt) {
      setError('Contact and appointment time are required.');
      return;
    }

    setLoading(true);
    setError(null);
    const appointmentAt = new Date(form.appointmentAt);
    if (Number.isNaN(appointmentAt.getTime())) {
      setError('Invalid appointment date');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/appraisals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          contactId: form.contactId,
          appointmentAt: appointmentAt.toISOString(),
          meetingType: form.meetingType,
          address: form.address || undefined,
          suburb: form.suburb || undefined,
          notes: form.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to create appraisal');
      if (json.data?.id) {
        router.push(`/appraisals/${json.data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create appraisal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Select
        label="Contact"
        value={form.contactId}
        onChange={(event) => handleContactChange(event.target.value)}
      >
        <option value="">Select a contact</option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.fullName}
          </option>
        ))}
      </Select>
      <Input
        label="Appointment date & time"
        type="datetime-local"
        value={form.appointmentAt}
        onChange={(event) => setForm((prev) => ({ ...prev, appointmentAt: event.target.value }))}
      />
      <Select
        label="Meeting type"
        value={form.meetingType}
        onChange={(event) => setForm((prev) => ({ ...prev, meetingType: event.target.value }))}
      >
        {MEETING_TYPES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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
      <Textarea
        label="Notes"
        value={form.notes}
        onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
        placeholder="Notes for the appointment"
        rows={4}
      />
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Create appraisal'}
        </Button>
      </div>
    </Card>
  );
}
