'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Chip, GlassCard, Input, MetricCard, Select, Textarea } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import ScoreBreakdownTooltip from '@/components/ui/ScoreBreakdownTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'under_offer', label: 'Under offer' },
  { value: 'sold', label: 'Sold' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const COMM_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'update', label: 'Update' },
  { value: 'report_sent', label: 'Report sent' },
];

const BUYER_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'inspection_booked', label: 'Inspection booked' },
  { value: 'attended', label: 'Attended' },
  { value: 'offer_potential', label: 'Offer potential' },
  { value: 'offer_made', label: 'Offer made' },
  { value: 'not_interested', label: 'Not interested' },
];

const INSPECTION_TYPES = [
  { value: 'open_home', label: 'Open home' },
  { value: 'private', label: 'Private' },
];

type Owner = { id: string; name: string | null; email: string | null };

type Listing = {
  id: string;
  address: string;
  suburb: string;
  status: string;
  listedAt: string | null;
  soldAt: string | null;
  priceGuideMin: number | null;
  priceGuideMax: number | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  cars: number | null;
  campaignHealthScore: number;
  campaignHealthReasons: string[];
  healthBand: 'healthy' | 'watch' | 'stalling';
  daysOnMarket: number;
  nextMilestoneDue: string | null;
  vendorUpdateLastSent: string | null;
  vendorUpdateOverdue: boolean;
  enquiriesCount: number;
  inspectionsCount: number;
  offersCount: number;
  vendor: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  owner: Owner | null;
};

type Milestone = {
  id: string;
  name: string;
  targetDueAt: string | null;
  completedAt: string | null;
  assignedToUserId: string | null;
  sortOrder: number;
};

type ChecklistItem = {
  id: string;
  title: string;
  isDone: boolean;
  dueAt: string | null;
  assignedToUserId: string | null;
  sortOrder: number;
};

type Enquiry = {
  id: string;
  occurredAt: string | null;
  source: string;
  buyerContactId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  notes: string | null;
};

type Buyer = {
  id: string;
  buyerContactId: string;
  status: string;
  nextFollowUpAt: string | null;
  notes: string | null;
  buyer: { id: string; name: string | null; email: string | null; phone: string | null; suburb: string | null };
};

type Inspection = {
  id: string;
  type: string;
  startsAt: string;
  endsAt: string | null;
  notes: string | null;
};

type VendorComm = {
  id: string;
  type: string;
  content: string;
  occurredAt: string;
};

type Report = {
  id: string;
  shareUrl: string;
  createdAt: string | null;
};

type ContactOption = {
  id: string;
  fullName: string;
  role: string;
};

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toDateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function healthBadge(score: number, band: Listing['healthBand']) {
  if (band === 'healthy') return { label: 'Healthy', variant: 'gold' as const };
  if (band === 'watch') return { label: 'Watch', variant: 'default' as const };
  return { label: 'Stalling', variant: 'muted' as const };
}

export default function ListingDetailView({ listingId }: { listingId: string }) {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [listing, setListing] = useState<Listing | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [vendorComms, setVendorComms] = useState<VendorComm[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('overview');

  const [listingDraft, setListingDraft] = useState({
    address: '',
    suburb: '',
    status: 'draft',
    listedAt: '',
    soldAt: '',
    priceGuideMin: '',
    priceGuideMax: '',
    propertyType: '',
    beds: '',
    baths: '',
    cars: '',
    ownerUserId: '',
    vendorContactId: '',
  });

  const [newMilestone, setNewMilestone] = useState({ name: '', targetDueAt: '' });
  const [newChecklist, setNewChecklist] = useState({ title: '', dueAt: '' });
  const [newEnquiry, setNewEnquiry] = useState({ occurredAt: '', source: '', buyerContactId: '', notes: '' });
  const [newBuyer, setNewBuyer] = useState({ buyerContactId: '', status: 'new', nextFollowUpAt: '', notes: '' });
  const [newInspection, setNewInspection] = useState({ type: 'open_home', startsAt: '', endsAt: '', notes: '' });
  const [newComm, setNewComm] = useState({ type: 'update', occurredAt: '', content: '' });
  const [reportDraft, setReportDraft] = useState({ commentary: '', recommendedNextActions: '' });

  const loadListing = useCallback(async () => {
    const res = await fetch(`/api/listings/${listingId}?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load listing');
    setListing(json.data as Listing);
  }, [listingId, orgId]);

  const loadMilestones = useCallback(async () => {
    const res = await fetch(`/api/listings/${listingId}/milestones?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load milestones');
    setMilestones(json.data as Milestone[]);
  }, [listingId, orgId]);

  const loadChecklist = useCallback(async () => {
    const res = await fetch(`/api/listings/${listingId}/checklist?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load checklist');
    setChecklist(json.data as ChecklistItem[]);
  }, [listingId, orgId]);

  const loadEnquiries = useCallback(async () => {
    const res = await fetch(`/api/listings/${listingId}/enquiries?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load enquiries');
    setEnquiries(json.data as Enquiry[]);
  }, [listingId, orgId]);

  const loadBuyers = useCallback(async () => {
    const res = await fetch(`/api/listings/${listingId}/buyers?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load buyers');
    setBuyers(json.data as Buyer[]);
  }, [listingId, orgId]);

  const loadInspections = useCallback(async () => {
    const res = await fetch(`/api/listings/${listingId}/inspections?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load inspections');
    setInspections(json.data as Inspection[]);
  }, [listingId, orgId]);

  const loadVendorComms = useCallback(async () => {
    const res = await fetch(`/api/listings/${listingId}/vendor-comms?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load vendor comms');
    setVendorComms(json.data as VendorComm[]);
  }, [listingId, orgId]);

  const loadReports = useCallback(async () => {
    const res = await fetch(`/api/listings/${listingId}/reports?orgId=${orgId}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load reports');
    setReports(json.data as Report[]);
  }, [listingId, orgId]);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadListing(),
        loadMilestones(),
        loadChecklist(),
        loadEnquiries(),
        loadBuyers(),
        loadInspections(),
        loadVendorComms(),
        loadReports(),
      ]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listing');
    } finally {
      setLoading(false);
    }
  }, [
    loadListing,
    loadMilestones,
    loadChecklist,
    loadEnquiries,
    loadBuyers,
    loadInspections,
    loadVendorComms,
    loadReports,
  ]);

  useEffect(() => {
    if (!orgId || !listingId) return;
    void refreshAll();
  }, [orgId, listingId, refreshAll]);

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

    const loadContacts = async () => {
      try {
        const res = await fetch(`/api/contacts?orgId=${orgId}&pageSize=200`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load contacts');
        const payload = json.data as { data?: ContactOption[] };
        if (!cancelled) setContacts(payload.data ?? []);
      } catch {
        if (!cancelled) setContacts([]);
      }
    };

    void loadOwners();
    void loadContacts();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!listing) return;
    setListingDraft({
      address: listing.address ?? '',
      suburb: listing.suburb ?? '',
      status: listing.status,
      listedAt: toDateInput(listing.listedAt),
      soldAt: toDateInput(listing.soldAt),
      priceGuideMin: listing.priceGuideMin?.toString() ?? '',
      priceGuideMax: listing.priceGuideMax?.toString() ?? '',
      propertyType: listing.propertyType ?? '',
      beds: listing.beds?.toString() ?? '',
      baths: listing.baths?.toString() ?? '',
      cars: listing.cars?.toString() ?? '',
      ownerUserId: listing.owner?.id ?? '',
      vendorContactId: listing.vendor?.id ?? '',
    });
  }, [listing]);

  const band = useMemo(() => healthBadge(listing?.campaignHealthScore ?? 0, listing?.healthBand ?? 'watch'), [listing]);

  const nextMilestone = useMemo(() => {
    const upcoming = milestones
      .filter((item) => item.targetDueAt && !item.completedAt)
      .map((item) => ({ ...item, date: new Date(item.targetDueAt as string) }))
      .filter((item) => !Number.isNaN(item.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return upcoming[0] ?? null;
  }, [milestones]);

  const checklistProgress = useMemo(() => {
    if (checklist.length === 0) return '0 / 0';
    const done = checklist.filter((item) => item.isDone).length;
    return `${done} / ${checklist.length}`;
  }, [checklist]);

  const nextAction = useMemo(() => {
    if (!listing) return 'Review campaign health';
    if (listing.vendorUpdateOverdue) return 'Send vendor update';
    if (nextMilestone) return `Complete milestone: ${nextMilestone.name}`;
    if (checklist.some((item) => !item.isDone)) return 'Progress listing checklist';
    if (listing.enquiriesCount === 0) return 'Boost buyer activity';
    return 'Review campaign health';
  }, [listing, nextMilestone, checklist]);

  const saveListing = async () => {
    if (!orgId || !listingId) return;
    setSaving(true);
    setError(null);

    const listedAt = listingDraft.listedAt ? new Date(listingDraft.listedAt) : null;
    const soldAt = listingDraft.soldAt ? new Date(listingDraft.soldAt) : null;

    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          address: listingDraft.address || undefined,
          suburb: listingDraft.suburb || undefined,
          status: listingDraft.status,
          listedAt: listedAt ? listedAt.toISOString() : null,
          soldAt: soldAt ? soldAt.toISOString() : null,
          priceGuideMin: listingDraft.priceGuideMin ? Number(listingDraft.priceGuideMin) : null,
          priceGuideMax: listingDraft.priceGuideMax ? Number(listingDraft.priceGuideMax) : null,
          propertyType: listingDraft.propertyType || null,
          beds: listingDraft.beds ? Number(listingDraft.beds) : null,
          baths: listingDraft.baths ? Number(listingDraft.baths) : null,
          cars: listingDraft.cars ? Number(listingDraft.cars) : null,
          ownerUserId: listingDraft.ownerUserId || null,
          vendorContactId: listingDraft.vendorContactId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update listing');
      setListing(json.data as Listing);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update listing');
    } finally {
      setSaving(false);
    }
  };

  const addMilestone = async () => {
    if (!orgId || !listingId || !newMilestone.name.trim()) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          name: newMilestone.name.trim(),
          targetDueAt: newMilestone.targetDueAt ? new Date(newMilestone.targetDueAt).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to add milestone');
      setNewMilestone({ name: '', targetDueAt: '' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add milestone');
    }
  };

  const updateMilestone = async (item: Milestone, updates: Partial<Milestone>) => {
    if (!orgId || !listingId) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/milestones`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          milestoneId: item.id,
          name: updates.name ?? item.name,
          targetDueAt: updates.targetDueAt ? new Date(updates.targetDueAt).toISOString() : updates.targetDueAt === null ? null : item.targetDueAt,
          completedAt: updates.completedAt ? new Date(updates.completedAt).toISOString() : updates.completedAt === null ? null : item.completedAt,
          assignedToUserId: updates.assignedToUserId ?? item.assignedToUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update milestone');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update milestone');
    }
  };

  const deleteMilestone = async (itemId: string) => {
    if (!orgId || !listingId) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/milestones`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, milestoneId: itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to delete milestone');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete milestone');
    }
  };

  const moveMilestone = async (index: number, direction: 'up' | 'down') => {
    const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const updated = [...sorted];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    const reordered = updated.map((item, idx) => ({ ...item, sortOrder: idx }));
    setMilestones(reordered);

    try {
      const res = await fetch(`/api/listings/${listingId}/milestones`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          order: reordered.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to reorder milestones');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder milestones');
    }
  };

  const addChecklistItem = async () => {
    if (!orgId || !listingId || !newChecklist.title.trim()) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          title: newChecklist.title.trim(),
          dueAt: newChecklist.dueAt ? new Date(newChecklist.dueAt).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to add checklist item');
      setNewChecklist({ title: '', dueAt: '' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add checklist item');
    }
  };

  const updateChecklistItem = async (item: ChecklistItem, updates: Partial<ChecklistItem>) => {
    if (!orgId || !listingId) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          itemId: item.id,
          title: updates.title ?? item.title,
          isDone: updates.isDone ?? item.isDone,
          dueAt: updates.dueAt ? new Date(updates.dueAt).toISOString() : updates.dueAt === null ? null : item.dueAt,
          assignedToUserId: updates.assignedToUserId ?? item.assignedToUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update checklist item');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update checklist item');
    }
  };

  const deleteChecklistItem = async (itemId: string) => {
    if (!orgId || !listingId) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/checklist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to delete checklist item');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete checklist item');
    }
  };

  const moveChecklistItem = async (index: number, direction: 'up' | 'down') => {
    const sorted = [...checklist].sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const updated = [...sorted];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    const reordered = updated.map((item, idx) => ({ ...item, sortOrder: idx }));
    setChecklist(reordered);

    try {
      const res = await fetch(`/api/listings/${listingId}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          order: reordered.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to reorder checklist');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder checklist');
    }
  };

  const addEnquiry = async () => {
    if (!orgId || !listingId || !newEnquiry.source.trim()) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          occurredAt: newEnquiry.occurredAt ? new Date(newEnquiry.occurredAt).toISOString() : undefined,
          source: newEnquiry.source.trim(),
          buyerContactId: newEnquiry.buyerContactId || undefined,
          notes: newEnquiry.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to add enquiry');
      setNewEnquiry({ occurredAt: '', source: '', buyerContactId: '', notes: '' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add enquiry');
    }
  };

  const addBuyer = async () => {
    if (!orgId || !listingId || !newBuyer.buyerContactId) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/buyers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          buyerContactId: newBuyer.buyerContactId,
          status: newBuyer.status,
          nextFollowUpAt: newBuyer.nextFollowUpAt ? new Date(newBuyer.nextFollowUpAt).toISOString() : undefined,
          notes: newBuyer.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to add buyer');
      setNewBuyer({ buyerContactId: '', status: 'new', nextFollowUpAt: '', notes: '' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add buyer');
    }
  };

  const updateBuyer = async (buyer: Buyer, updates: Partial<Buyer>) => {
    if (!orgId || !listingId) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/buyers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          buyerId: buyer.id,
          status: updates.status ?? buyer.status,
          nextFollowUpAt: updates.nextFollowUpAt ? new Date(updates.nextFollowUpAt).toISOString() : updates.nextFollowUpAt === null ? null : buyer.nextFollowUpAt,
          notes: updates.notes ?? buyer.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to update buyer');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update buyer');
    }
  };

  const addInspection = async () => {
    if (!orgId || !listingId || !newInspection.startsAt) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/inspections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          type: newInspection.type,
          startsAt: new Date(newInspection.startsAt).toISOString(),
          endsAt: newInspection.endsAt ? new Date(newInspection.endsAt).toISOString() : undefined,
          notes: newInspection.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to add inspection');
      setNewInspection({ type: 'open_home', startsAt: '', endsAt: '', notes: '' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add inspection');
    }
  };

  const deleteInspection = async (inspectionId: string) => {
    if (!orgId || !listingId) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/inspections`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, inspectionId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to delete inspection');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete inspection');
    }
  };

  const addVendorComm = async () => {
    if (!orgId || !listingId || !newComm.content.trim()) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/vendor-comms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          type: newComm.type,
          occurredAt: newComm.occurredAt ? new Date(newComm.occurredAt).toISOString() : undefined,
          content: newComm.content.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to add vendor comms');
      setNewComm({ type: 'update', occurredAt: '', content: '' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add vendor comms');
    }
  };

  const createReport = async () => {
    if (!orgId || !listingId) return;
    try {
      const res = await fetch(`/api/listings/${listingId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          commentary: reportDraft.commentary,
          recommendedNextActions: reportDraft.recommendedNextActions,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to create report');
      setReportDraft({ commentary: '', recommendedNextActions: '' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
    }
  };

  if (loading) {
    return <Card>Loading listing...</Card>;
  }

  if (!listing) {
    return <Card>Listing not found.</Card>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold text-text-primary">{listing.address || 'Listing'}</p>
            <p className="text-xs text-text-tertiary">{listing.suburb || 'No suburb'}</p>
            {listing.vendor && (
              <div className="mt-2 text-xs text-text-tertiary">
                Vendor: {listing.vendor.name || listing.vendor.email || listing.vendor.phone || 'Unknown'}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricCard
            label="Status"
            value={<span className="text-2xl font-semibold text-text-primary">{listing.status}</span>}
            helper={listing.listedAt ? `Listed ${formatDate(listing.listedAt)}` : 'Not yet listed'}
          />
          <MetricCard
            label="Days on market"
            value={listing.daysOnMarket}
            helper={listing.listedAt ? `Since ${formatDate(listing.listedAt)}` : 'Draft listing'}
          />
          <MetricCard
            label="Campaign health"
            value={(
              <div className="flex items-center gap-2">
                <span>{listing.campaignHealthScore ?? 0}</span>
                <Badge variant={band.variant}>{band.label}</Badge>
                <ScoreBreakdownTooltip
                  label={`Campaign health details for ${listing.address || 'listing'}`}
                  meaning="Tracks campaign momentum based on milestones, activity, and vendor updates."
                  bullets={[
                    'Checklist and milestones progress lift health.',
                    'Recent enquiries and inspections add momentum.',
                    'Overdue vendor updates or milestones reduce health.',
                  ]}
                  reasons={listing.campaignHealthReasons}
                  bands="Healthy is 70+, Watch is 40-69, Stalling is below 40."
                />
              </div>
            )}
            helper="Momentum across milestones and buyer activity"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-md border border-border-subtle px-3 py-2 text-xs text-text-tertiary">
            Next milestone: <span className="text-text-primary">{formatDate(listing.nextMilestoneDue)}</span>
          </div>
          <div className="rounded-md border border-border-subtle px-3 py-2 text-xs text-text-tertiary">
            Next action: <span className="text-text-primary">{nextAction}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-xs text-text-tertiary">
            Vendor cadence:
            <span className={cn(listing.vendorUpdateOverdue ? 'text-red-400 font-semibold' : 'text-text-primary')}>
              {listing.vendorUpdateOverdue ? 'Overdue' : 'On track'}
            </span>
            <InfoTooltip
              label="Vendor cadence info"
              content={<p className="text-xs text-text-secondary">Updates should be sent every 7 days. Overdue listings lose campaign momentum.</p>}
            />
          </div>
          <div className="rounded-md border border-border-subtle px-3 py-2 text-xs text-text-tertiary">
            Last update: <span className={cn(listing.vendorUpdateOverdue ? 'text-red-400 font-semibold' : 'text-text-primary')}>
              {formatDate(listing.vendorUpdateLastSent)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {listing.campaignHealthReasons.length === 0 ? (
            <Badge variant="muted">No score reasons yet</Badge>
          ) : (
            listing.campaignHealthReasons.map((reason, index) => (
              <Badge key={`${listing.id}-reason-${index}`} variant="muted">
                {reason}
              </Badge>
            ))
          )}
        </div>
      </GlassCard>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'milestones', label: 'Milestones' },
          { key: 'checklist', label: 'Checklist' },
          { key: 'buyers', label: 'Buyer log' },
          { key: 'inspections', label: 'Inspections' },
          { key: 'vendor-comms', label: 'Vendor comms' },
          { key: 'reports', label: 'Vendor reports' },
        ].map((tab) => (
          <Chip key={tab.key} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </Chip>
        ))}
      </div>

      {activeTab === 'overview' && (
        <GlassCard className="space-y-4">
          <p className="text-sm font-semibold text-text-primary">Listing details</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Address"
              value={listingDraft.address}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, address: event.target.value }))}
            />
            <Input
              label="Suburb"
              value={listingDraft.suburb}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, suburb: event.target.value }))}
            />
            <Select
              label="Status"
              value={listingDraft.status}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, status: event.target.value }))}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Owner"
              value={listingDraft.ownerUserId}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, ownerUserId: event.target.value }))}
            >
              <option value="">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name || owner.email || owner.id}
                </option>
              ))}
            </Select>
            <Select
              label="Vendor contact"
              value={listingDraft.vendorContactId}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, vendorContactId: event.target.value }))}
            >
              <option value="">Select a contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.fullName} {contact.role !== 'unknown' ? `(${contact.role})` : ''}
                </option>
              ))}
            </Select>
            <Input
              label="Listed date"
              type="date"
              value={listingDraft.listedAt}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, listedAt: event.target.value }))}
            />
            <Input
              label="Sold date"
              type="date"
              value={listingDraft.soldAt}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, soldAt: event.target.value }))}
            />
            <Input
              label="Price guide min"
              type="number"
              value={listingDraft.priceGuideMin}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, priceGuideMin: event.target.value }))}
            />
            <Input
              label="Price guide max"
              type="number"
              value={listingDraft.priceGuideMax}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, priceGuideMax: event.target.value }))}
            />
            <Input
              label="Property type"
              value={listingDraft.propertyType}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, propertyType: event.target.value }))}
            />
            <Input
              label="Beds"
              type="number"
              value={listingDraft.beds}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, beds: event.target.value }))}
            />
            <Input
              label="Baths"
              type="number"
              value={listingDraft.baths}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, baths: event.target.value }))}
            />
            <Input
              label="Cars"
              type="number"
              value={listingDraft.cars}
              onChange={(event) => setListingDraft((prev) => ({ ...prev, cars: event.target.value }))}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveListing} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </GlassCard>
      )}

      {activeTab === 'milestones' && (
        <GlassCard className="space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">Campaign milestones</p>
            <InfoTooltip
              label="Milestones timing info"
              content={<p className="text-xs text-text-secondary">Keeping milestones on time keeps the campaign healthy and boosts buyer momentum.</p>}
            />
          </div>
          <div className="space-y-3">
            {milestones.length === 0 ? (
              <p className="text-sm text-text-secondary">No milestones yet.</p>
            ) : (
              milestones
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((item, index) => (
                  <div key={item.id} className="rounded-md border border-border-subtle p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <Input
                        value={item.name}
                        onChange={(event) => {
                          const next = milestones.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row);
                          setMilestones(next);
                        }}
                        onBlur={(event) => updateMilestone(item, { name: event.target.value })}
                      />
                      <Button variant="ghost" size="sm" onClick={() => moveMilestone(index, 'up')}>Up</Button>
                      <Button variant="ghost" size="sm" onClick={() => moveMilestone(index, 'down')}>Down</Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMilestone(item.id)}>Delete</Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Input
                        label="Target date"
                        type="date"
                        value={item.targetDueAt ? toDateInput(item.targetDueAt) : ''}
                        onChange={(event) => updateMilestone(item, { targetDueAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
                      />
                      <Select
                        label="Assigned to"
                        value={item.assignedToUserId ?? ''}
                        onChange={(event) => updateMilestone(item, { assignedToUserId: event.target.value || null })}
                      >
                        <option value="">Unassigned</option>
                        {owners.map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.name || owner.email || owner.id}
                          </option>
                        ))}
                      </Select>
                      <div className="flex items-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => updateMilestone(item, { completedAt: new Date().toISOString() })}
                        >
                          Mark complete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateMilestone(item, { completedAt: null })}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    {item.completedAt && (
                      <p className="text-xs text-text-tertiary">Completed {formatDate(item.completedAt)}</p>
                    )}
                  </div>
                ))
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              label="New milestone"
              value={newMilestone.name}
              onChange={(event) => setNewMilestone((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Schedule photography"
            />
            <Input
              label="Target date"
              type="date"
              value={newMilestone.targetDueAt}
              onChange={(event) => setNewMilestone((prev) => ({ ...prev, targetDueAt: event.target.value }))}
            />
            <div className="flex items-end">
              <Button variant="secondary" onClick={addMilestone}>Add milestone</Button>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === 'checklist' && (
        <GlassCard className="space-y-4">
          <p className="text-sm font-semibold text-text-primary">Listing checklist</p>
          <p className="text-xs text-text-tertiary">Progress {checklistProgress}</p>
          <div className="space-y-3">
            {checklist.length === 0 ? (
              <p className="text-sm text-text-secondary">No checklist items yet.</p>
            ) : (
              checklist
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((item, index) => (
                  <div key={item.id} className="rounded-md border border-border-subtle p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.isDone}
                        onChange={(event) => updateChecklistItem(item, { isDone: event.target.checked })}
                      />
                      <Input
                        value={item.title}
                        onChange={(event) => {
                          const next = checklist.map((row) => row.id === item.id ? { ...row, title: event.target.value } : row);
                          setChecklist(next);
                        }}
                        onBlur={(event) => updateChecklistItem(item, { title: event.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Input
                        label="Due date"
                        type="date"
                        value={item.dueAt ? toDateInput(item.dueAt) : ''}
                        onChange={(event) => updateChecklistItem(item, { dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
                      />
                      <Select
                        label="Assigned to"
                        value={item.assignedToUserId ?? ''}
                        onChange={(event) => updateChecklistItem(item, { assignedToUserId: event.target.value || null })}
                      >
                        <option value="">Unassigned</option>
                        {owners.map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.name || owner.email || owner.id}
                          </option>
                        ))}
                      </Select>
                      <div className="flex items-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => moveChecklistItem(index, 'up')}>Up</Button>
                        <Button variant="ghost" size="sm" onClick={() => moveChecklistItem(index, 'down')}>Down</Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(item.id)}>Delete</Button>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              label="New checklist item"
              value={newChecklist.title}
              onChange={(event) => setNewChecklist((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Prepare marketing copy"
            />
            <Input
              label="Due date"
              type="date"
              value={newChecklist.dueAt}
              onChange={(event) => setNewChecklist((prev) => ({ ...prev, dueAt: event.target.value }))}
            />
            <div className="flex items-end">
              <Button variant="secondary" onClick={addChecklistItem}>Add item</Button>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === 'buyers' && (
        <div className="space-y-4">
          <GlassCard className="space-y-3">
            <p className="text-sm font-semibold text-text-primary">Enquiries</p>
            {enquiries.length === 0 ? (
              <p className="text-sm text-text-secondary">No enquiries logged yet.</p>
            ) : (
              <div className="space-y-2">
                {enquiries.map((row) => (
                  <div key={row.id} className="rounded-md border border-border-subtle p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-text-primary">{row.source}</p>
                      <p className="text-xs text-text-tertiary">{formatDateTime(row.occurredAt)}</p>
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {row.buyerName || row.buyerEmail || 'No buyer linked'}
                    </p>
                    {row.notes && <p className="mt-2 text-sm text-text-secondary">{row.notes}</p>}
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                label="Occurred at"
                type="datetime-local"
                value={newEnquiry.occurredAt}
                onChange={(event) => setNewEnquiry((prev) => ({ ...prev, occurredAt: event.target.value }))}
              />
              <Input
                label="Source"
                value={newEnquiry.source}
                onChange={(event) => setNewEnquiry((prev) => ({ ...prev, source: event.target.value }))}
                placeholder="REA / Referral"
              />
              <Select
                label="Buyer contact"
                value={newEnquiry.buyerContactId}
                onChange={(event) => setNewEnquiry((prev) => ({ ...prev, buyerContactId: event.target.value }))}
              >
                <option value="">Select a contact</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.fullName} {contact.role !== 'unknown' ? `(${contact.role})` : ''}
                  </option>
                ))}
              </Select>
              <Input
                label="Notes"
                value={newEnquiry.notes}
                onChange={(event) => setNewEnquiry((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
            <Button variant="secondary" onClick={addEnquiry}>Add enquiry</Button>
          </GlassCard>

          <GlassCard className="space-y-3">
            <p className="text-sm font-semibold text-text-primary">Buyer pipeline</p>
            {buyers.length === 0 ? (
              <p className="text-sm text-text-secondary">No buyers linked yet.</p>
            ) : (
              <div className="space-y-3">
                {buyers.map((buyer) => (
                  <div key={buyer.id} className="rounded-md border border-border-subtle p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Link href={`/contacts/${buyer.buyerContactId}`} className="text-sm font-semibold text-text-primary hover:underline">
                          {buyer.buyer.name || 'Buyer'}
                        </Link>
                        <p className="text-xs text-text-tertiary">{buyer.buyer.suburb || buyer.buyer.email || '-'}</p>
                      </div>
                      <Select
                        value={buyer.status}
                        onChange={(event) => {
                          const value = event.target.value;
                          setBuyers((prev) => prev.map((row) => row.id === buyer.id ? { ...row, status: value } : row));
                          updateBuyer(buyer, { status: value });
                        }}
                      >
                        {BUYER_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input
                        label="Next follow-up"
                        type="date"
                        value={buyer.nextFollowUpAt ? toDateInput(buyer.nextFollowUpAt) : ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          const iso = value ? new Date(value).toISOString() : null;
                          setBuyers((prev) => prev.map((row) => row.id === buyer.id ? { ...row, nextFollowUpAt: iso } : row));
                          updateBuyer(buyer, { nextFollowUpAt: iso });
                        }}
                      />
                      <Input
                        label="Notes"
                        value={buyer.notes ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          setBuyers((prev) => prev.map((row) => row.id === buyer.id ? { ...row, notes: value } : row));
                        }}
                        onBlur={(event) => updateBuyer(buyer, { notes: event.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select
                label="Add buyer"
                value={newBuyer.buyerContactId}
                onChange={(event) => setNewBuyer((prev) => ({ ...prev, buyerContactId: event.target.value }))}
              >
                <option value="">Select a contact</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.fullName} {contact.role !== 'unknown' ? `(${contact.role})` : ''}
                  </option>
                ))}
              </Select>
              <Select
                label="Status"
                value={newBuyer.status}
                onChange={(event) => setNewBuyer((prev) => ({ ...prev, status: event.target.value }))}
              >
                {BUYER_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Next follow-up"
                type="date"
                value={newBuyer.nextFollowUpAt}
                onChange={(event) => setNewBuyer((prev) => ({ ...prev, nextFollowUpAt: event.target.value }))}
              />
              <Input
                label="Notes"
                value={newBuyer.notes}
                onChange={(event) => setNewBuyer((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
            <Button variant="secondary" onClick={addBuyer}>Add buyer</Button>
          </GlassCard>
        </div>
      )}

      {activeTab === 'inspections' && (
        <GlassCard className="space-y-4">
          <p className="text-sm font-semibold text-text-primary">Inspections</p>
          {inspections.length === 0 ? (
            <p className="text-sm text-text-secondary">No inspections scheduled yet.</p>
          ) : (
            <div className="space-y-2">
              {inspections.map((inspection) => (
                <div key={inspection.id} className="rounded-md border border-border-subtle p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text-primary">
                      {inspection.type.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-text-tertiary">{formatDateTime(inspection.startsAt)}</p>
                  </div>
                  {inspection.notes && <p className="mt-2 text-sm text-text-secondary">{inspection.notes}</p>}
                  <div className="mt-2 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => deleteInspection(inspection.id)}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              label="Type"
              value={newInspection.type}
              onChange={(event) => setNewInspection((prev) => ({ ...prev, type: event.target.value }))}
            >
              {INSPECTION_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              label="Starts at"
              type="datetime-local"
              value={newInspection.startsAt}
              onChange={(event) => setNewInspection((prev) => ({ ...prev, startsAt: event.target.value }))}
            />
            <Input
              label="Ends at"
              type="datetime-local"
              value={newInspection.endsAt}
              onChange={(event) => setNewInspection((prev) => ({ ...prev, endsAt: event.target.value }))}
            />
            <Input
              label="Notes"
              value={newInspection.notes}
              onChange={(event) => setNewInspection((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <Button variant="secondary" onClick={addInspection}>Add inspection</Button>
        </GlassCard>
      )}

      {activeTab === 'vendor-comms' && (
        <GlassCard className="space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">Vendor communications</p>
            <InfoTooltip
              label="Vendor updates info"
              content={<p className="text-xs text-text-secondary">Regular vendor updates keep confidence high and improve campaign health.</p>}
            />
          </div>
          {vendorComms.length === 0 ? (
            <p className="text-sm text-text-secondary">No vendor comms logged yet.</p>
          ) : (
            <div className="space-y-2">
              {vendorComms.map((comm) => (
                <div key={comm.id} className="rounded-md border border-border-subtle p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text-primary">{comm.type.replace('_', ' ')}</p>
                    <p className="text-xs text-text-tertiary">{formatDateTime(comm.occurredAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">{comm.content}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              label="Type"
              value={newComm.type}
              onChange={(event) => setNewComm((prev) => ({ ...prev, type: event.target.value }))}
            >
              {COMM_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              label="Occurred at"
              type="datetime-local"
              value={newComm.occurredAt}
              onChange={(event) => setNewComm((prev) => ({ ...prev, occurredAt: event.target.value }))}
            />
            <Textarea
              label="Content"
              value={newComm.content}
              onChange={(event) => setNewComm((prev) => ({ ...prev, content: event.target.value }))}
              rows={3}
            />
          </div>
          <Button variant="secondary" onClick={addVendorComm}>Log vendor update</Button>
        </GlassCard>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-4">
          <GlassCard className="space-y-3">
            <p className="text-sm font-semibold text-text-primary">Generate vendor report</p>
            <Textarea
              label="Agent commentary"
              value={reportDraft.commentary}
              onChange={(event) => setReportDraft((prev) => ({ ...prev, commentary: event.target.value }))}
              rows={4}
              placeholder="Summary of activity and recommendations."
            />
            <Textarea
              label="Recommended next actions"
              value={reportDraft.recommendedNextActions}
              onChange={(event) => setReportDraft((prev) => ({ ...prev, recommendedNextActions: event.target.value }))}
              rows={3}
              placeholder="Pricing review, marketing refresh, open home schedule."
            />
            <Button variant="secondary" onClick={createReport}>Generate report</Button>
          </GlassCard>

          <GlassCard className="space-y-3">
            <p className="text-sm font-semibold text-text-primary">Report history</p>
            {reports.length === 0 ? (
              <p className="text-sm text-text-secondary">No reports generated yet.</p>
            ) : (
              <div className="space-y-2">
                {reports.map((report) => (
                  <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle p-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Vendor report</p>
                      <p className="text-xs text-text-tertiary">{formatDate(report.createdAt)}</p>
                    </div>
                    <Link href={report.shareUrl} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm">Open share link</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
