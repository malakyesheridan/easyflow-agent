'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, GlassCard, Input, PageHeader, SectionHeader, Select, Textarea } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';

type ReportTemplate = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  templateType: string;
  cadenceDefaultType: string;
  cadenceDefaultIntervalDays: number | null;
  cadenceDefaultDayOfWeek: number | null;
  sectionsJson?: Record<string, boolean> | null;
  promptsJson?: Record<string, string> | null;
};

type TemplateDraft = {
  id: string | null;
  name: string;
  description: string;
  isDefault: boolean;
  cadenceDefaultType: string;
  cadenceDefaultIntervalDays: string;
  cadenceDefaultDayOfWeek: string;
  sections: Record<string, boolean>;
  prompts: Record<string, string>;
};

const SECTION_OPTIONS = [
  { key: 'campaignSnapshot', label: 'Campaign snapshot' },
  { key: 'milestonesProgress', label: 'Milestones progress' },
  { key: 'buyerActivitySummary', label: 'Buyer activity summary' },
  { key: 'buyerPipelineBreakdown', label: 'Buyer pipeline breakdown' },
  { key: 'feedbackThemes', label: 'Feedback themes' },
  { key: 'recommendations', label: 'Recommendations / next actions' },
  { key: 'marketingChannels', label: 'Marketing channels' },
  { key: 'comparableSales', label: 'Comparable sales' },
];

const DEFAULT_SECTIONS = SECTION_OPTIONS.reduce<Record<string, boolean>>((acc, option) => {
  acc[option.key] = true;
  return acc;
}, {});

const DEFAULT_PROMPTS = {
  commentary: 'What changed this week?',
  recommendations: 'What are we recommending next?',
  feedbackThemes: 'Key buyer feedback themes?',
};

function toDraft(template?: ReportTemplate | null): TemplateDraft {
  const sections = template?.sectionsJson && Object.keys(template.sectionsJson).length > 0
    ? (template.sectionsJson as Record<string, boolean>)
    : DEFAULT_SECTIONS;
  const prompts = template?.promptsJson && Object.keys(template.promptsJson).length > 0
    ? (template.promptsJson as Record<string, string>)
    : DEFAULT_PROMPTS;

  return {
    id: template?.id ?? null,
    name: template?.name ?? '',
    description: template?.description ?? '',
    isDefault: template?.isDefault ?? false,
    cadenceDefaultType: template?.cadenceDefaultType ?? 'weekly',
    cadenceDefaultIntervalDays: template?.cadenceDefaultIntervalDays?.toString() ?? '',
    cadenceDefaultDayOfWeek: template?.cadenceDefaultDayOfWeek?.toString() ?? '',
    sections: { ...sections },
    prompts: { ...prompts },
  };
}

export default function ReportTemplatesView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(() => toDraft());

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === draft.id) ?? null,
    [templates, draft.id]
  );

  const loadTemplates = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/report-templates?orgId=${orgId}&type=vendor`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load templates');
      setTemplates(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!templates.length) return;
    const defaultTemplate = templates.find((template) => template.isDefault) ?? templates[0];
    if (!draft.id && defaultTemplate) {
      setDraft(toDraft(defaultTemplate));
    }
  }, [templates, draft.id]);

  const selectTemplate = (template: ReportTemplate) => {
    setDraft(toDraft(template));
  };

  const resetDraft = () => {
    setDraft(toDraft());
  };

  const saveTemplate = async () => {
    if (!orgId) return;
    if (!draft.name.trim()) {
      setError('Template name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        orgId,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        isDefault: draft.isDefault,
        cadenceDefaultType: draft.cadenceDefaultType,
        cadenceDefaultIntervalDays: draft.cadenceDefaultType === 'custom'
          ? Number(draft.cadenceDefaultIntervalDays || 0) || null
          : null,
        cadenceDefaultDayOfWeek: draft.cadenceDefaultDayOfWeek
          ? Number(draft.cadenceDefaultDayOfWeek)
          : null,
        sectionsJson: draft.sections,
        promptsJson: draft.prompts,
      };

      const res = await fetch(
        draft.id ? `/api/report-templates/${draft.id}` : '/api/report-templates',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, templateType: 'vendor' }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to save template');
      await loadTemplates();
      if (json.data?.id) {
        setDraft(toDraft(json.data as ReportTemplate));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/report-templates/${templateId}?orgId=${orgId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to delete template');
      await loadTemplates();
      if (draft.id === templateId) {
        resetDraft();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report templates"
        subtitle="Manage sections, cadence defaults, and prompts."
        actions={(
          <Link href="/reports">
            <Button variant="ghost">Back to reports</Button>
          </Link>
        )}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1.8fr]">
        <GlassCard className="space-y-3">
          <SectionHeader title="Templates" subtitle="Vendor reporting templates for your org." />
          {loading ? (
            <p className="text-sm text-text-secondary">Loading templates...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-text-secondary">No templates yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-section/30 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {template.name} {template.isDefault ? '(default)' : ''}
                    </p>
                    {template.description && (
                      <p className="text-xs text-text-tertiary">{template.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => selectTemplate(template)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteTemplate(template.id)} disabled={saving}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button variant="secondary" onClick={resetDraft}>
            Create new template
          </Button>
        </GlassCard>

        <GlassCard className="space-y-4">
          <SectionHeader
            title={draft.id ? 'Edit template' : 'New template'}
            subtitle="Configure cadence defaults and included sections."
            actions={(
              <InfoTooltip
                label="Template info"
                content={(
                  <p className="text-xs text-text-secondary">
                    Templates control what appears in vendor reports and set default cadence for new listings.
                  </p>
                )}
              />
            )}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Template name"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Weekly vendor update"
            />
            <Input
              label="Description"
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Short summary of when to use this template."
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select
              label="Default cadence"
              value={draft.cadenceDefaultType}
              onChange={(event) => setDraft((prev) => ({ ...prev, cadenceDefaultType: event.target.value }))}
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom interval</option>
              <option value="none">None</option>
            </Select>
            {draft.cadenceDefaultType === 'custom' && (
              <Input
                label="Interval (days)"
                inputMode="numeric"
                value={draft.cadenceDefaultIntervalDays}
                onChange={(event) => setDraft((prev) => ({
                  ...prev,
                  cadenceDefaultIntervalDays: event.target.value.replace(/[^\d]/g, ''),
                }))}
              />
            )}
            <Select
              label="Preferred day"
              value={draft.cadenceDefaultDayOfWeek}
              onChange={(event) => setDraft((prev) => ({ ...prev, cadenceDefaultDayOfWeek: event.target.value }))}
            >
              <option value="">Any day</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="0">Sunday</option>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">Included sections</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {SECTION_OPTIONS.map((section) => (
                <label key={section.key} className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={draft.sections[section.key] ?? false}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        sections: { ...prev.sections, [section.key]: event.target.checked },
                      }))
                    }
                  />
                  {section.label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text-primary">Commentary prompts</p>
            <Textarea
              label="Commentary prompt"
              value={draft.prompts.commentary ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  prompts: { ...prev.prompts, commentary: event.target.value },
                }))
              }
              rows={2}
            />
            <Textarea
              label="Recommendations prompt"
              value={draft.prompts.recommendations ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  prompts: { ...prev.prompts, recommendations: event.target.value },
                }))
              }
              rows={2}
            />
            <Textarea
              label="Feedback themes prompt"
              value={draft.prompts.feedbackThemes ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  prompts: { ...prev.prompts, feedbackThemes: event.target.value },
                }))
              }
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(event) => setDraft((prev) => ({ ...prev, isDefault: event.target.checked }))}
            />
            Set as default template
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={saveTemplate} disabled={saving}>
              {saving ? 'Saving...' : 'Save template'}
            </Button>
            {activeTemplate && (
              <Button variant="ghost" onClick={resetDraft}>
                Cancel
              </Button>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
