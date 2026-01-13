'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Chip from '@/components/ui/Chip';
import { cn } from '@/lib/utils';
import { renderEmailHtml } from '@/lib/communications/renderer';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type ProviderStatus = {
  emailProvider: string;
  emailEnabled: boolean;
  smsProvider: string;
  smsEnabled: boolean;
  lastTestedAt: string | null;
  lastTestResult: any;
  resendConfigured: boolean;
  allowedFromDomains: string[];
  defaultFromName: string | null;
  defaultFromEmail: string | null;
  defaultReplyTo: string | null;
  senderIdentity: {
    fromName: string | null;
    fromEmail: string | null;
    replyTo: string | null;
    usingDefaults: boolean;
    warnings: string[];
  };
  commFromName: string | null;
  commFromEmail: string | null;
  commReplyToEmail: string | null;
};

type TemplateRow = {
  id: string;
  key: string;
  channel: 'email' | 'sms' | 'in_app';
  name: string;
  subject: string | null;
  body: string;
  bodyHtml: string | null;
  variablesSchema?: Record<string, any>;
  version: number;
  updatedAt: string;
};

type PreferenceRow = {
  id: string;
  eventKey: string;
  enabled: boolean;
  enabledEmail: boolean;
  enabledSms: boolean;
  enabledInApp: boolean;
  sendToAdmins: boolean | null;
  sendToAssignedCrew: boolean | null;
  sendToClientContacts: boolean | null;
  sendToSiteContacts: boolean | null;
  additionalEmails: string | null;
  deliveryMode: string | null;
  recipientRules: any;
  timing: any;
};

type OutboxRow = {
  id: string;
  eventKey: string;
  channel: string;
  status: string;
  recipientEmail: string | null;
  recipientUserId: string | null;
  createdAt: string;
  subjectRendered: string | null;
  bodyRendered: string;
  bodyHtmlRendered: string | null;
  error: string | null;
  entityType: string;
  entityId: string;
  provider: string;
  providerMessageId: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyToEmail: string | null;
  sentAt: string | null;
  metadata: any;
};

type CommEventOption = {
  id: string;
  eventKey: string;
  entityType: string;
  entityId: string;
  createdAt: string;
};

type PreviewResult = {
  subject: string | null;
  bodyText: string;
  bodyHtml: string;
  missingVars: string[];
};

type CrewRow = {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  active: boolean | null;
};

type DigestPreview = {
  crewId: string;
  crewName: string;
  email: string | null;
  totalJobs: number;
  subject: string | null;
  bodyText: string;
  bodyHtml: string;
  missingVars: string[];
  digest: {
    date: string;
    dayName: string;
    dateLabel: string;
    totalJobs: number;
  };
};

type DigestSkip = {
  crewId: string;
  crewName: string;
  email: string | null;
  reason: string;
};

type DigestPreviewPayload = {
  baseDayKey: string;
  timeZone: string;
  previews: DigestPreview[];
  skipped: DigestSkip[];
};

const tabs = [
  { key: 'providers', label: 'Providers' },
  { key: 'templates', label: 'Templates' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'log', label: 'Message Log' },
];

const COMMON_VARIABLES = [
  'org.name',
  'org.email',
  'actor.name',
  'actor.role',
  'recipient.name',
  'recipient.email',
  'job.title',
  'job.status',
  'job.address',
  'job.scheduledStart',
  'job.scheduledEnd',
  'client.name',
  'client.email',
  'crewSummary',
  'links.appEntityUrl',
  'links.mapsUrl',
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getEmailDomain(value: string): string {
  return value.split('@')[1]?.toLowerCase() ?? '';
}

function isAllowedDomain(value: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = getEmailDomain(value);
  return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function humanizeEventKey(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function flattenSchemaPaths(schema: any, prefix = ''): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(schema)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...flattenSchemaPaths(value, next));
    } else {
      paths.push(next);
    }
  }
  return paths;
}

function extractTemplateVariables(input: string): string[] {
  const matches = input.match(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g) ?? [];
  return matches.map((match) => match.replace(/{{|}}/g, '').trim());
}

function formatCrewName(row: CrewRow): string {
  const fullName = `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim();
  return row.displayName || fullName || row.email || `Crew ${row.id.slice(0, 8)}`;
}

function getLocalDayKey(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

function getDefaultDigestDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return getLocalDayKey(date);
}

export default function CommunicationsSettingsView({ orgId }: { orgId: string }) {
  const [activeTab, setActiveTab] = useState('providers');
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerSuccess, setProviderSuccess] = useState<string | null>(null);
  const [commFromName, setCommFromName] = useState('');
  const [commFromEmail, setCommFromEmail] = useState('');
  const [commReplyToEmail, setCommReplyToEmail] = useState('');
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEventKey, setTestEventKey] = useState('system_test_email');

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );
  const emailTemplateKeys = useMemo(() => {
    const keys = Array.from(
      new Set(templates.filter((template) => template.channel === 'email').map((template) => template.key))
    );
    return keys.sort();
  }, [templates]);
  const variablePaths = useMemo(() => {
    if (!selectedTemplate) return COMMON_VARIABLES;
    const schema = selectedTemplate.variablesSchema ?? {};
    const schemaPaths = flattenSchemaPaths(schema);
    const templateVars = extractTemplateVariables(
      [selectedTemplate.subject, selectedTemplate.body, selectedTemplate.bodyHtml].filter(Boolean).join(' ')
    );
    const combined = new Set([...COMMON_VARIABLES, ...schemaPaths, ...templateVars]);
    return Array.from(combined).sort();
  }, [selectedTemplate]);
  const allowedFromDomains = useMemo(
    () => providerStatus?.allowedFromDomains ?? [],
    [providerStatus?.allowedFromDomains]
  );
  const fromEmailError = useMemo(() => {
    if (!commFromEmail.trim()) return null;
    if (!isValidEmail(commFromEmail)) return 'Enter a valid email address';
    if (!isAllowedDomain(commFromEmail, allowedFromDomains)) {
      return `Domain must be one of: ${allowedFromDomains.join(', ')}`;
    }
    return null;
  }, [allowedFromDomains, commFromEmail]);
  const replyToError = useMemo(() => {
    if (!commReplyToEmail.trim()) return null;
    if (!isValidEmail(commReplyToEmail)) return 'Enter a valid reply-to email';
    return null;
  }, [commReplyToEmail]);
  const canSaveSender = !fromEmailError && !replyToError;
  const canSendTestEmail = isValidEmail(testEmailTo.trim());
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', bodyText: '', bodyHtml: '' });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [previewEntityType, setPreviewEntityType] = useState('job');
  const [previewEntityId, setPreviewEntityId] = useState('');
  const [previewEventId, setPreviewEventId] = useState('');
  const [previewPayload, setPreviewPayload] = useState('');
  const [previewPayloadError, setPreviewPayloadError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [recentEvents, setRecentEvents] = useState<CommEventOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [digestCrewRows, setDigestCrewRows] = useState<CrewRow[]>([]);
  const [digestCrewLoading, setDigestCrewLoading] = useState(false);
  const [digestCrewError, setDigestCrewError] = useState<string | null>(null);
  const [digestCrewId, setDigestCrewId] = useState('all');
  const [digestDate, setDigestDate] = useState(getDefaultDigestDate);
  const [digestIncludeTomorrow, setDigestIncludeTomorrow] = useState(false);
  const [digestSendEmpty, setDigestSendEmpty] = useState(false);
  const [digestPreviewData, setDigestPreviewData] = useState<DigestPreviewPayload | null>(null);
  const [digestPreviewLoading, setDigestPreviewLoading] = useState(false);
  const [digestPreviewError, setDigestPreviewError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<PreferenceRow[]>([]);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [outboxError, setOutboxError] = useState<string | null>(null);
  const [outboxFilters, setOutboxFilters] = useState({
    status: '',
    channel: '',
    eventKey: '',
    recipient: '',
    startDate: '',
    endDate: '',
  });
  const [selectedOutboxId, setSelectedOutboxId] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setProviderLoading(true);
    setProviderError(null);
    try {
      const res = await fetch(`/api/communications/providers?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<ProviderStatus>;
      if (!res.ok || !json.ok) throw new Error('Failed to load providers');
      setProviderStatus(json.data);
      setCommFromName(json.data.commFromName ?? '');
      setCommFromEmail(json.data.commFromEmail ?? '');
      setCommReplyToEmail(json.data.commReplyToEmail ?? '');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to load providers');
    } finally {
      setProviderLoading(false);
    }
  }, [orgId]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await fetch(`/api/communications/templates?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<TemplateRow[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load templates');
      setTemplates(json.data);
      if (!selectedTemplateId && json.data.length > 0) {
        setSelectedTemplateId(json.data[0].id);
      }
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, [orgId, selectedTemplateId]);

  const loadRecentEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/communications/events?orgId=${orgId}&limit=25`);
      const json = (await res.json()) as ApiResponse<CommEventOption[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load recent events');
      setRecentEvents(json.data);
    } catch (error) {
      setRecentEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [orgId]);

  const loadDigestCrews = useCallback(async () => {
    setDigestCrewLoading(true);
    setDigestCrewError(null);
    try {
      const res = await fetch(`/api/crews?orgId=${orgId}&activeOnly=true`);
      const json = (await res.json()) as ApiResponse<CrewRow[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load crew list');
      setDigestCrewRows(json.data);
    } catch (error) {
      setDigestCrewRows([]);
      setDigestCrewError(error instanceof Error ? error.message : 'Failed to load crew list');
    } finally {
      setDigestCrewLoading(false);
    }
  }, [orgId]);

  const loadPreferences = useCallback(async () => {
    setPreferencesLoading(true);
    setPreferencesError(null);
    try {
      const res = await fetch(`/api/communications/preferences?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<PreferenceRow[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load preferences');
      setPreferences(
        json.data.map((row) => ({
          ...row,
          enabled: row.enabled ?? true,
          sendToAdmins: row.sendToAdmins ?? false,
          sendToAssignedCrew: row.sendToAssignedCrew ?? false,
          sendToClientContacts: row.sendToClientContacts ?? false,
          sendToSiteContacts: row.sendToSiteContacts ?? false,
          additionalEmails: row.additionalEmails ?? '',
          deliveryMode: row.deliveryMode ?? 'instant',
        }))
      );
    } catch (error) {
      setPreferencesError(error instanceof Error ? error.message : 'Failed to load preferences');
    } finally {
      setPreferencesLoading(false);
    }
  }, [orgId]);

  const loadOutbox = useCallback(async () => {
    setOutboxLoading(true);
    setOutboxError(null);
    try {
      const params = new URLSearchParams({ orgId });
      if (outboxFilters.status) params.set('status', outboxFilters.status);
      if (outboxFilters.channel) params.set('channel', outboxFilters.channel);
      if (outboxFilters.eventKey) params.set('eventKey', outboxFilters.eventKey);
      if (outboxFilters.recipient) params.set('recipient', outboxFilters.recipient);
      if (outboxFilters.startDate) params.set('start', outboxFilters.startDate);
      if (outboxFilters.endDate) params.set('end', outboxFilters.endDate);
      const res = await fetch(`/api/communications/outbox?${params.toString()}`);
      const json = (await res.json()) as ApiResponse<OutboxRow[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load outbox');
      setOutbox(json.data);
    } catch (error) {
      setOutboxError(error instanceof Error ? error.message : 'Failed to load outbox');
    } finally {
      setOutboxLoading(false);
    }
  }, [
    orgId,
    outboxFilters.channel,
    outboxFilters.endDate,
    outboxFilters.eventKey,
    outboxFilters.recipient,
    outboxFilters.startDate,
    outboxFilters.status,
  ]);

  const runDigestPreview = useCallback(async () => {
    setDigestPreviewLoading(true);
    setDigestPreviewError(null);
    setDigestPreviewData(null);
    try {
      const res = await fetch('/api/communications/daily-crew-digest/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          date: digestDate || undefined,
          includeTomorrow: digestIncludeTomorrow,
          sendEmpty: digestSendEmpty,
          crewId: digestCrewId !== 'all' ? digestCrewId : undefined,
        }),
      });
      const json = (await res.json()) as ApiResponse<DigestPreviewPayload>;
      if (!res.ok || !json.ok) throw new Error('Preview failed');
      setDigestPreviewData(json.data);
    } catch (error) {
      setDigestPreviewData(null);
      setDigestPreviewError(error instanceof Error ? error.message : 'Preview failed');
    } finally {
      setDigestPreviewLoading(false);
    }
  }, [digestCrewId, digestDate, digestIncludeTomorrow, digestSendEmpty, orgId]);

  useEffect(() => {
    if (activeTab === 'providers') void loadProviders();
    if (activeTab === 'templates') {
      void loadTemplates();
      void loadRecentEvents();
      void loadDigestCrews();
    }
    if (activeTab === 'providers' && templates.length === 0) void loadTemplates();
    if (activeTab === 'preferences') void loadPreferences();
    if (activeTab === 'log') {
      void loadOutbox();
      if (!providerStatus) void loadProviders();
    }
  }, [
    activeTab,
    loadDigestCrews,
    loadOutbox,
    loadPreferences,
    loadProviders,
    loadTemplates,
    loadRecentEvents,
    providerStatus,
    templates.length,
  ]);

  useEffect(() => {
    if (selectedTemplate) {
      setTemplateForm({
        name: selectedTemplate.name ?? '',
        subject: selectedTemplate.subject ?? '',
        bodyText: selectedTemplate.body ?? '',
        bodyHtml:
          selectedTemplate.bodyHtml ??
          (selectedTemplate.channel === 'email' ? renderEmailHtml(selectedTemplate.body ?? '') : ''),
      });
    }
  }, [selectedTemplate]);

  const saveProviderSettings = useCallback(async () => {
    setProviderError(null);
    setProviderSuccess(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          commFromName: commFromName.trim() || null,
          commFromEmail: commFromEmail.trim() || null,
          commReplyToEmail: commReplyToEmail.trim() || null,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) throw new Error('Failed to save provider settings');
      setProviderSuccess('Saved');
      setTimeout(() => setProviderSuccess(null), 2000);
      void loadProviders();
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to save provider settings');
    }
  }, [commFromEmail, commReplyToEmail, commFromName, loadProviders, orgId]);

  const sendTestEmail = useCallback(async () => {
    setProviderError(null);
    setProviderSuccess(null);
    try {
      if (!canSendTestEmail) {
        setProviderError('Enter a valid destination email');
        return;
      }
      const res = await fetch('/api/communications/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          action: 'test-email',
          to: testEmailTo.trim(),
          eventKey: testEventKey,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) throw new Error('Test email failed');
      const status = json.data?.status ?? 'queued';
      setProviderSuccess(status === 'sent' ? 'Test email sent' : 'Test email queued');
      setTimeout(() => setProviderSuccess(null), 2000);
      void loadProviders();
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Test email failed');
    }
  }, [canSendTestEmail, loadProviders, orgId, testEmailTo, testEventKey]);

  const saveTemplate = useCallback(async () => {
    if (!selectedTemplate) return;
    setTemplateSaving(true);
    setTemplatesError(null);
    try {
      const res = await fetch('/api/communications/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          templateId: selectedTemplate.id,
          name: templateForm.name.trim() || selectedTemplate.name,
          subject: templateForm.subject.trim() || null,
          body: templateForm.bodyText,
          bodyHtml: templateForm.bodyHtml,
        }),
      });
      const json = (await res.json()) as ApiResponse<TemplateRow>;
      if (!res.ok || !json.ok) throw new Error('Failed to save template');
      await loadTemplates();
      setSelectedTemplateId(json.data.id);
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setTemplateSaving(false);
    }
  }, [loadTemplates, orgId, selectedTemplate, templateForm.bodyHtml, templateForm.bodyText, templateForm.name, templateForm.subject]);

  const resetTemplate = useCallback(async () => {
    if (!selectedTemplate) return;
    setTemplateSaving(true);
    setTemplatesError(null);
    try {
      const res = await fetch('/api/communications/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          action: 'reset',
          templateId: selectedTemplate.id,
        }),
      });
      const json = (await res.json()) as ApiResponse<TemplateRow>;
      if (!res.ok || !json.ok) throw new Error('Failed to reset template');
      await loadTemplates();
      setSelectedTemplateId(json.data.id);
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : 'Failed to reset template');
    } finally {
      setTemplateSaving(false);
    }
  }, [loadTemplates, orgId, selectedTemplate]);

  const runPreview = useCallback(async () => {
    if (!selectedTemplate) return;
    setPreviewLoading(true);
    setPreviewResult(null);
    setPreviewPayloadError(null);
    try {
      let payloadObj: Record<string, any> | null = null;
      if (previewPayload.trim()) {
        try {
          payloadObj = JSON.parse(previewPayload);
        } catch {
          setPreviewPayloadError('Invalid JSON payload');
          setPreviewLoading(false);
          return;
        }
      }
      const res = await fetch('/api/communications/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          templateId: selectedTemplate.id,
          eventId: previewEventId || undefined,
          entityType: previewEventId ? undefined : previewEntityType,
          entityId: previewEventId ? undefined : previewEntityId,
          payload: payloadObj ?? undefined,
        }),
      });
      const json = (await res.json()) as ApiResponse<PreviewResult>;
      if (!res.ok || !json.ok) throw new Error('Preview failed');
      setPreviewResult(json.data);
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }, [orgId, previewEntityId, previewEntityType, previewEventId, previewPayload, selectedTemplate]);

  const updatePreference = useCallback(
    async (index: number, patch: Partial<PreferenceRow>) => {
      const preference = preferences[index];
      if (!preference) return;
      setPreferencesSaving(true);
      setPreferencesError(null);
      try {
        const updated = { ...preference, ...patch };
        const res = await fetch('/api/communications/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            eventKey: updated.eventKey,
            enabled: updated.enabled,
            enabledEmail: updated.enabledEmail,
            enabledSms: updated.enabledSms,
            enabledInApp: updated.enabledInApp,
            sendToAdmins: updated.sendToAdmins,
            sendToAssignedCrew: updated.sendToAssignedCrew,
            sendToClientContacts: updated.sendToClientContacts,
            sendToSiteContacts: updated.sendToSiteContacts,
            additionalEmails: updated.additionalEmails ?? '',
            deliveryMode: updated.deliveryMode ?? null,
            recipientRules: updated.recipientRules ?? {},
            timing: updated.timing ?? {},
          }),
        });
        const json = (await res.json()) as ApiResponse<PreferenceRow>;
        if (!res.ok || !json.ok) throw new Error('Failed to save preference');
        setPreferences((prev) =>
          prev.map((row) => (row.eventKey === updated.eventKey ? { ...row, ...json.data } : row))
        );
      } catch (error) {
        setPreferencesError(error instanceof Error ? error.message : 'Failed to save preference');
      } finally {
        setPreferencesSaving(false);
      }
    },
    [orgId, preferences]
  );

  const updatePreferenceRules = (index: number, patch: Record<string, any>) => {
    setPreferences((prev) =>
      prev.map((row, idx) =>
        idx === index ? { ...row, recipientRules: { ...(row.recipientRules ?? {}), ...patch } } : row
      )
    );
  };

  const updatePreferenceFields = (index: number, patch: Partial<PreferenceRow>) => {
    setPreferences((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const updatePreferenceTiming = (index: number, patch: Record<string, any>) => {
    setPreferences((prev) =>
      prev.map((row, idx) =>
        idx === index ? { ...row, timing: { ...(row.timing ?? {}), ...patch } } : row
      )
    );
  };

  const selectedOutbox = useMemo(
    () => outbox.find((row) => row.id === selectedOutboxId) || null,
    [outbox, selectedOutboxId]
  );
  const selectedOutboxRecipients = useMemo(() => {
    if (!selectedOutbox) return { to: [] as string[], cc: [] as string[], bcc: [] as string[] };
    const recipients = selectedOutbox.metadata?.recipients;
    if (recipients && Array.isArray(recipients.to)) {
      return {
        to: recipients.to ?? [],
        cc: recipients.cc ?? [],
        bcc: recipients.bcc ?? [],
      };
    }
    return { to: selectedOutbox.recipientEmail ? [selectedOutbox.recipientEmail] : [], cc: [], bcc: [] };
  }, [selectedOutbox]);

  const entityLink = useMemo(() => {
    if (!selectedOutbox) return null;
    if (selectedOutbox.entityType === 'job') {
      return `/jobs/${selectedOutbox.entityId}?orgId=${orgId}`;
    }
    const jobId =
      selectedOutbox.metadata?.variables?.job?.id ??
      selectedOutbox.metadata?.eventPayload?.jobId ??
      selectedOutbox.metadata?.eventPayload?.job?.id;
    if (jobId) {
      return `/jobs/${jobId}?orgId=${orgId}`;
    }
    return null;
  }, [orgId, selectedOutbox]);

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </Card>

      {activeTab === 'providers' && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Sender identity</h2>
              <p className="text-xs text-text-tertiary mt-1">Set how emails appear to recipients.</p>
            </div>
            <Button variant="secondary" onClick={saveProviderSettings} disabled={providerLoading || !canSaveSender}>
              Save sender settings
            </Button>
          </div>

          {providerError && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400 mb-3">
              {providerError}
            </div>
          )}
          {providerSuccess && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400 mb-3">
              {providerSuccess}
            </div>
          )}
          {providerStatus?.senderIdentity?.usingDefaults && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300 mb-3">
              Using default sender identity. Update the fields below to use org-specific settings.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="From name"
              value={commFromName}
              onChange={(e) => setCommFromName(e.target.value)}
              placeholder="EasyFlow Ops"
            />
            <Input
              label="From email"
              value={commFromEmail}
              onChange={(e) => setCommFromEmail(e.target.value)}
              placeholder="ops@yourdomain.com"
              error={fromEmailError ?? undefined}
            />
            <Input
              label="Reply-to email"
              value={commReplyToEmail}
              onChange={(e) => setCommReplyToEmail(e.target.value)}
              placeholder="support@yourdomain.com"
              error={replyToError ?? undefined}
            />
          </div>
          {allowedFromDomains.length > 0 && (
            <p className="text-xs text-text-tertiary mt-2">
              Allowed domains: {allowedFromDomains.join(', ')}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Email provider</p>
              <p className="text-xs text-text-tertiary">
                {providerStatus?.resendConfigured ? 'Resend configured' : 'Missing RESEND_API_KEY'}
              </p>
            </div>
            <Chip active={providerStatus?.resendConfigured ?? false}>
              {providerStatus?.resendConfigured ? 'Configured' : 'Missing key'}
            </Chip>
          </div>

          <div className="mt-6 border-t border-border-subtle pt-4 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Send test email</h3>
              <p className="text-xs text-text-tertiary">Queues a test email through the dispatcher.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-3">
              <Input
                label="Destination email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="you@yourdomain.com"
                error={testEmailTo.trim() && !canSendTestEmail ? 'Enter a valid email' : undefined}
              />
              <Select label="Template" value={testEventKey} onChange={(e) => setTestEventKey(e.target.value)}>
                <option value="system_test_email">System test</option>
                {emailTemplateKeys.map((key) => (
                  <option key={key} value={key}>
                    {humanizeEventKey(key)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={sendTestEmail} disabled={providerLoading || !canSendTestEmail}>
                Send test email
              </Button>
            </div>
          </div>

          <div className="mt-6 border-t border-border-subtle pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">SMS provider</h3>
                <p className="text-xs text-text-tertiary mt-1">Stubbed for now. Enable after Twilio verification.</p>
              </div>
              <Chip active={false}>Disabled</Chip>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-text-primary">Templates</h2>
              <Button variant="secondary" onClick={loadTemplates} disabled={templatesLoading}>
                Refresh
              </Button>
            </div>
            {templatesError && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400 mb-3">
                {templatesError}
              </div>
            )}
            {templatesLoading ? (
              <p className="text-sm text-text-secondary">Loading templates...</p>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={cn(
                      'w-full text-left rounded-md border px-3 py-2 transition',
                      selectedTemplateId === template.id
                        ? 'border-accent-gold bg-accent-gold/10 text-text-primary'
                        : 'border-border-subtle bg-bg-section/30 text-text-secondary'
                    )}
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <div className="text-sm font-medium">{template.key}</div>
                    <div className="text-xs text-text-tertiary">{template.channel} - v{template.version}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
            {selectedTemplate ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Edit template</h2>
                    <p className="text-xs text-text-tertiary">Saving creates a new version automatically.</p>
                  </div>
                  <Button variant="secondary" onClick={resetTemplate} disabled={templateSaving}>
                    Reset to default
                  </Button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
                  <div className="space-y-4">
                    <Input
                      label="Name"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    {selectedTemplate.channel === 'email' && (
                      <Input
                        label="Subject"
                        value={templateForm.subject}
                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))}
                      />
                    )}
                    {selectedTemplate.channel === 'email' && (
                      <Textarea
                        label="HTML body"
                        rows={10}
                        value={templateForm.bodyHtml}
                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, bodyHtml: e.target.value }))}
                      />
                    )}
                    <Textarea
                      label={selectedTemplate.channel === 'email' ? 'Text fallback' : 'Body'}
                      rows={8}
                      value={templateForm.bodyText}
                      onChange={(e) => setTemplateForm((prev) => ({ ...prev, bodyText: e.target.value }))}
                    />
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-3">
                    <p className="text-xs font-semibold text-text-primary mb-2">Variables</p>
                    <div className="flex flex-wrap gap-2">
                      {variablePaths.map((path) => (
                        <span key={path} className="text-[11px] text-text-secondary bg-bg-input px-2 py-1 rounded">
                          {'{{' + path + '}}'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveTemplate} disabled={templateSaving}>
                    {templateSaving ? 'Saving...' : 'Save new version'}
                  </Button>
                </div>

                <div className="border-t border-border-subtle pt-4">
                  <h3 className="text-sm font-semibold text-text-primary mb-2">Preview</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Select
                      label="Recent event"
                      value={previewEventId}
                      onChange={(e) => setPreviewEventId(e.target.value)}
                    >
                      <option value="">{eventsLoading ? 'Loading events...' : 'Select recent event'}</option>
                      {recentEvents.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.eventKey} - {formatDate(event.createdAt)}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Entity type"
                      value={previewEntityType}
                      onChange={(e) => setPreviewEntityType(e.target.value)}
                      disabled={Boolean(previewEventId)}
                    >
                      <option value="job">Job</option>
                      <option value="invoice">Invoice</option>
                      <option value="payment">Payment</option>
                      <option value="announcement">Announcement</option>
                    </Select>
                    <Input
                      label="Entity ID"
                      value={previewEntityId}
                      onChange={(e) => setPreviewEntityId(e.target.value)}
                      placeholder="Paste an ID to preview"
                      disabled={Boolean(previewEventId)}
                    />
                  </div>
                  <div className="mt-3">
                    <Textarea
                      label="Payload JSON (optional)"
                      rows={6}
                      value={previewPayload}
                      onChange={(e) => setPreviewPayload(e.target.value)}
                      placeholder='{"job": {"title": "Example"}}'
                    />
                    {previewPayloadError && (
                      <p className="text-xs text-red-400 mt-1">{previewPayloadError}</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={runPreview}
                      disabled={previewLoading || (!previewEventId && !previewEntityId)}
                    >
                      {previewLoading ? 'Rendering...' : 'Render preview'}
                    </Button>
                    {previewResult && previewResult.missingVars.length > 0 && (
                      <span className="text-xs text-amber-300">
                        Missing: {previewResult.missingVars.join(', ')}
                      </span>
                    )}
                  </div>
                  {previewResult && (
                    <div className="mt-4 rounded-md border border-border-subtle bg-bg-section/20 p-3 space-y-3">
                      {previewResult.subject && (
                        <p className="text-sm font-semibold text-text-primary">{previewResult.subject}</p>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-text-tertiary mb-1">Text fallback</p>
                          <pre className="whitespace-pre-wrap text-xs text-text-secondary">
                            {previewResult.bodyText}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs text-text-tertiary mb-1">HTML preview</p>
                          <div
                            className="rounded border border-border-subtle bg-white p-3 text-[13px] text-black"
                            dangerouslySetInnerHTML={{ __html: previewResult.bodyHtml }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Select a template to edit.</p>
            )}
          </Card>
          <Card>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Daily crew digest preview</h2>
                <p className="text-xs text-text-tertiary">Developer-only preview for upcoming crew emails.</p>
              </div>
              <Button variant="secondary" onClick={loadDigestCrews} disabled={digestCrewLoading}>
                {digestCrewLoading ? 'Loading crew...' : 'Refresh crew'}
              </Button>
            </div>
            {digestCrewError && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400 mb-3">
                {digestCrewError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                label="Base date"
                type="date"
                value={digestDate}
                onChange={(e) => setDigestDate(e.target.value)}
              />
              <Select label="Crew" value={digestCrewId} onChange={(e) => setDigestCrewId(e.target.value)}>
                <option value="all">All crew</option>
                {digestCrewRows.map((crew) => (
                  <option key={crew.id} value={crew.id}>
                    {formatCrewName(crew)}
                  </option>
                ))}
              </Select>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={digestIncludeTomorrow}
                    onChange={(e) => setDigestIncludeTomorrow(e.target.checked)}
                  />
                  Include tomorrow
                </label>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={digestSendEmpty}
                    onChange={(e) => setDigestSendEmpty(e.target.checked)}
                  />
                  Send empty
                </label>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={runDigestPreview} disabled={digestPreviewLoading}>
                {digestPreviewLoading ? 'Rendering...' : 'Preview digest'}
              </Button>
              {digestPreviewError && <span className="text-xs text-red-400">{digestPreviewError}</span>}
              {digestPreviewData && (
                <span className="text-xs text-text-tertiary">
                  Base day: {digestPreviewData.baseDayKey} ({digestPreviewData.timeZone})
                </span>
              )}
            </div>
            {digestPreviewData && (
              <div className="mt-4 space-y-3">
                {digestPreviewData.previews.length === 0 ? (
                  <p className="text-sm text-text-secondary">No previews generated.</p>
                ) : (
                  digestPreviewData.previews.map((preview) => (
                    <div key={preview.crewId} className="rounded-md border border-border-subtle bg-bg-section/20 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{preview.crewName}</p>
                          <p className="text-xs text-text-tertiary">{preview.email ?? 'No email set'}</p>
                        </div>
                        <span className="text-xs text-text-tertiary">
                          {preview.totalJobs} jobs
                        </span>
                      </div>
                      {preview.subject && (
                        <p className="text-sm text-text-primary">{preview.subject}</p>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-text-tertiary mb-1">Text fallback</p>
                          <pre className="whitespace-pre-wrap text-xs text-text-secondary">{preview.bodyText}</pre>
                        </div>
                        <div>
                          <p className="text-xs text-text-tertiary mb-1">HTML preview</p>
                          <div
                            className="rounded border border-border-subtle bg-white p-3 text-[13px] text-black"
                            dangerouslySetInnerHTML={{ __html: preview.bodyHtml }}
                          />
                        </div>
                      </div>
                      {preview.missingVars.length > 0 && (
                        <p className="text-xs text-amber-300">
                          Missing: {preview.missingVars.join(', ')}
                        </p>
                      )}
                    </div>
                  ))
                )}
                {digestPreviewData.skipped.length > 0 && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                    Skipped: {digestPreviewData.skipped.map((row) => `${row.crewName} (${row.reason})`).join(', ')}
                  </div>
                )}
              </div>
            )}
          </Card>
          </div>
        </div>
      )}

      {activeTab === 'preferences' && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Preferences & Rules</h2>
              <p className="text-xs text-text-tertiary">Toggle channels and recipient rules per event.</p>
            </div>
            <Button variant="secondary" onClick={loadPreferences} disabled={preferencesLoading}>
              Refresh
            </Button>
          </div>
          {preferencesError && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400 mb-3">
              {preferencesError}
            </div>
          )}
          {preferencesLoading ? (
            <p className="text-sm text-text-secondary">Loading preferences...</p>
          ) : (
            <div className="space-y-4">
              {preferences.map((pref, index) => {
                const rules = pref.recipientRules ?? {};
                return (
                  <div key={pref.id} className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{humanizeEventKey(pref.eventKey)}</p>
                        <p className="text-xs text-text-tertiary">{pref.eventKey}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Chip active={pref.enabled} onClick={() => updatePreference(index, { enabled: !pref.enabled })}>
                          Enabled
                        </Chip>
                        <Chip
                          active={pref.enabledEmail}
                          onClick={() => updatePreference(index, { enabledEmail: !pref.enabledEmail })}
                        >
                          Email
                        </Chip>
                        <Chip active={pref.enabledSms} onClick={() => updatePreference(index, { enabledSms: !pref.enabledSms })}>
                          SMS
                        </Chip>
                        <Chip
                          active={pref.enabledInApp}
                          onClick={() => updatePreference(index, { enabledInApp: !pref.enabledInApp })}
                        >
                          In-app
                        </Chip>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(pref.sendToAdmins)}
                          onChange={(e) => updatePreferenceFields(index, { sendToAdmins: e.target.checked })}
                        />
                        Admins & managers
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(pref.sendToAssignedCrew)}
                          onChange={(e) => updatePreferenceFields(index, { sendToAssignedCrew: e.target.checked })}
                        />
                        Assigned crew
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(pref.sendToClientContacts)}
                          onChange={(e) => updatePreferenceFields(index, { sendToClientContacts: e.target.checked })}
                        />
                        Client contacts
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(pref.sendToSiteContacts)}
                          onChange={(e) => updatePreferenceFields(index, { sendToSiteContacts: e.target.checked })}
                        />
                        Job site contacts
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(rules.to_all_staff)}
                          onChange={(e) => updatePreferenceRules(index, { to_all_staff: e.target.checked })}
                        />
                        All staff
                      </label>
                      <Select
                        label="Crew delivery mode"
                        value={pref.deliveryMode ?? 'instant'}
                        onChange={(e) => updatePreferenceFields(index, { deliveryMode: e.target.value })}
                      >
                        <option value="instant">Instant</option>
                        <option value="digest">Digest</option>
                      </Select>
                      <Input
                        label="Additional emails"
                        value={pref.additionalEmails ?? ''}
                        onChange={(e) => updatePreferenceFields(index, { additionalEmails: e.target.value })}
                        placeholder="ops@yourdomain.com, owner@yourdomain.com"
                      />
                      <Input
                        label="Delay minutes"
                        value={pref.timing?.delay_minutes ?? ''}
                        onChange={(e) =>
                          updatePreferenceTiming(index, { delay_minutes: e.target.value ? Number(e.target.value) : null })
                        }
                        placeholder="0"
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        onClick={() => updatePreference(index, {})}
                        disabled={preferencesSaving}
                      >
                        Save rules
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'log' && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Email provider:{' '}
                {providerStatus
                  ? providerStatus.resendConfigured
                    ? 'Resend configured (OK)'
                    : 'Missing RESEND_API_KEY'
                  : 'Loading...'}
              </p>
              <p className="text-xs text-text-tertiary">
                Sender identity:{' '}
                {providerStatus
                  ? providerStatus.senderIdentity?.usingDefaults
                    ? 'Using defaults'
                    : 'Using org settings'
                  : 'Loading...'}
              </p>
            </div>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
            <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-text-primary">Message Log</h2>
              <Button variant="secondary" onClick={loadOutbox} disabled={outboxLoading}>
                Refresh
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <Select
                label="Status"
                value={outboxFilters.status}
                onChange={(e) => setOutboxFilters((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All</option>
                <option value="queued">Queued</option>
                <option value="sending">Sending</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="suppressed">Suppressed</option>
              </Select>
              <Select
                label="Channel"
                value={outboxFilters.channel}
                onChange={(e) => setOutboxFilters((prev) => ({ ...prev, channel: e.target.value }))}
              >
                <option value="">All</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="in_app">In-app</option>
              </Select>
              <Input
                label="Event key"
                value={outboxFilters.eventKey}
                onChange={(e) => setOutboxFilters((prev) => ({ ...prev, eventKey: e.target.value }))}
                placeholder="job_assigned"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <Input
                label="Recipient contains"
                value={outboxFilters.recipient}
                onChange={(e) => setOutboxFilters((prev) => ({ ...prev, recipient: e.target.value }))}
                placeholder="client@example.com"
              />
              <Input
                label="Start date"
                type="date"
                value={outboxFilters.startDate}
                onChange={(e) => setOutboxFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
              <Input
                label="End date"
                type="date"
                value={outboxFilters.endDate}
                onChange={(e) => setOutboxFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            {outboxError && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400 mb-3">
                {outboxError}
              </div>
            )}
            {outboxLoading ? (
              <p className="text-sm text-text-secondary">Loading messages...</p>
            ) : (
              <div className="space-y-2">
                {outbox.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={cn(
                      'w-full text-left rounded-md border px-3 py-2 transition',
                      selectedOutboxId === row.id
                        ? 'border-accent-gold bg-accent-gold/10 text-text-primary'
                        : 'border-border-subtle bg-bg-section/30 text-text-secondary'
                    )}
                    onClick={() => setSelectedOutboxId(row.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{row.eventKey}</span>
                      <span className="text-xs text-text-tertiary">{row.status}</span>
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {row.channel} - {formatDate(row.createdAt)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            {selectedOutbox ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{selectedOutbox.eventKey}</p>
                  <p className="text-xs text-text-tertiary">
                    {selectedOutbox.channel} - {selectedOutbox.status} - {formatDate(selectedOutbox.createdAt)}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-text-secondary">
                  <div>
                    <p className="text-text-tertiary">From</p>
                    <p className="text-text-primary">
                      {selectedOutbox.fromName ? `${selectedOutbox.fromName} ` : ''}
                      {selectedOutbox.fromEmail ?? '-'}
                    </p>
                    <p className="text-text-tertiary mt-1">Reply-to</p>
                    <p className="text-text-primary">{selectedOutbox.replyToEmail ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-text-tertiary">To</p>
                    <p className="text-text-primary">
                      {selectedOutboxRecipients.to.length > 0 ? selectedOutboxRecipients.to.join(', ') : '-'}
                    </p>
                    <p className="text-text-tertiary mt-1">CC / BCC</p>
                    <p className="text-text-primary">
                      {(selectedOutboxRecipients.cc ?? []).join(', ') || '-'} / {(selectedOutboxRecipients.bcc ?? []).join(', ') || '-'}
                    </p>
                  </div>
                </div>
                {selectedOutbox.subjectRendered && (
                  <div>
                    <p className="text-xs text-text-tertiary">Subject</p>
                    <p className="text-sm text-text-primary">{selectedOutbox.subjectRendered}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-text-tertiary">Text</p>
                  <pre className="whitespace-pre-wrap text-xs text-text-secondary">{selectedOutbox.bodyRendered}</pre>
                </div>
                {selectedOutbox.bodyHtmlRendered && (
                  <div>
                    <p className="text-xs text-text-tertiary">HTML</p>
                    <div
                      className="rounded border border-border-subtle bg-white p-3 text-[13px] text-black"
                      dangerouslySetInnerHTML={{ __html: selectedOutbox.bodyHtmlRendered }}
                    />
                  </div>
                )}
                <div className="text-xs text-text-tertiary">
                  Provider: {selectedOutbox.provider} - Message ID: {selectedOutbox.providerMessageId ?? '-'}
                </div>
                {selectedOutbox.sentAt && (
                  <div className="text-xs text-text-tertiary">Sent at: {formatDate(selectedOutbox.sentAt)}</div>
                )}
                {selectedOutbox.metadata?.skipReason && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                    Skipped: {selectedOutbox.metadata.skipReason}
                  </div>
                )}
                {selectedOutbox.error && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                    {selectedOutbox.error}
                  </div>
                )}
                {selectedOutbox.metadata?.eventPayload && (
                  <div>
                    <p className="text-xs text-text-tertiary">Event payload snapshot</p>
                    <pre className="whitespace-pre-wrap text-[11px] text-text-secondary">
                      {JSON.stringify(selectedOutbox.metadata.eventPayload, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="text-xs text-text-tertiary">
                  Entity: {selectedOutbox.entityType} - {selectedOutbox.entityId}
                </div>
                {entityLink && (
                  <a href={entityLink} className="text-xs text-accent-gold">
                    Open entity
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Select a message to see details.</p>
            )}
          </Card>
        </div>
        </div>
      )}
    </div>
  );
}
