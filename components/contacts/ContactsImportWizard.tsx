'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { Button, Card, Input, Select } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { useSession } from '@/hooks/useSession';

type PreviewData = {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
};

type Summary = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

const FIELD_DEFS = [
  { key: 'full_name', label: 'Full name', aliases: ['full name', 'full_name', 'name'] },
  { key: 'first_name', label: 'First name', aliases: ['first name', 'first_name', 'given name', 'given_name'] },
  { key: 'last_name', label: 'Last name', aliases: ['last name', 'last_name', 'surname', 'family name', 'family_name'] },
  { key: 'email', label: 'Email', aliases: ['email', 'email address', 'email_address'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'phone_number', 'mobile', 'mobile phone', 'mobile_phone'] },
  { key: 'address', label: 'Address', aliases: ['address', 'street', 'street address', 'street_address'] },
  { key: 'suburb', label: 'Suburb', aliases: ['suburb', 'city', 'locality', 'town'] },
  { key: 'lead_source', label: 'Lead source', aliases: ['lead source', 'lead_source', 'source'] },
  { key: 'role', label: 'Role', aliases: ['role', 'contact role', 'contact_role'] },
  { key: 'seller_stage', label: 'Seller stage', aliases: ['seller stage', 'seller_stage', 'stage'] },
  { key: 'temperature', label: 'Temperature', aliases: ['temperature', 'heat', 'lead temperature', 'lead_temperature'] },
  { key: 'last_touch_at', label: 'Last touch', aliases: ['last touch', 'last_touch_at', 'last contacted', 'last_contacted'] },
  { key: 'next_touch_at', label: 'Next touch', aliases: ['next touch', 'next_touch_at', 'next follow up', 'next_follow_up'] },
  { key: 'tags', label: 'Tags', aliases: ['tags', 'tag', 'labels'], tooltip: 'Use commas or semicolons to separate multiple tags.' },
];

const DEDUPE_OPTIONS = [
  { value: 'create_only', label: 'Create only (skip duplicates)' },
  { value: 'upsert', label: 'Upsert (update duplicates)' },
] as const;

const STEP_LABELS = ['Upload CSV', 'Map fields', 'Validation', 'Import'];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildInitialMapping(headers: string[]) {
  const normalizedHeaders = headers.map((header) => ({
    header,
    key: normalizeHeader(header),
  }));
  const mapping: Record<string, string> = {};

  FIELD_DEFS.forEach((field) => {
    const match = field.aliases
      .map((alias) => normalizeHeader(alias))
      .map((alias) => normalizedHeaders.find((item) => item.key === alias))
      .find(Boolean);
    if (match) {
      mapping[field.key] = match.header;
    }
  });

  return mapping;
}

export default function ContactsImportWizard() {
  const { config } = useOrgConfig();
  const { session } = useSession();
  const orgId = config?.orgId ?? '';
  const capabilities = session?.actor?.capabilities ?? [];
  const canImport = capabilities.includes('admin') || capabilities.includes('manage_org');

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dedupeMode, setDedupeMode] = useState<'create_only' | 'upsert'>('create_only');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failedRowsCsv, setFailedRowsCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headerOptions = useMemo(() => preview?.headers ?? [], [preview?.headers]);

  const mappingReady = Boolean(mapping.full_name) || (Boolean(mapping.first_name) && Boolean(mapping.last_name));

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setFileName(nextFile?.name ?? '');
    setPreview(null);
    setMapping({});
    setSummary(null);
    setFailedRowsCsv('');
    setError(null);
    setStep(1);
    if (nextFile) {
      const text = await nextFile.text();
      setCsvText(text);
    } else {
      setCsvText('');
    }
  };

  const handlePreview = async () => {
    if (!file || !orgId) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('orgId', orgId);
      formData.append('file', file);
      const res = await fetch('/api/contacts/import/preview', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to preview CSV');
      setPreview(json.data as PreviewData);
      setMapping(buildInitialMapping(json.data.headers ?? []));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview CSV');
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = (fieldKey: string, header: string) => {
    setMapping((prev) => ({ ...prev, [fieldKey]: header }));
  };

  const handleExecute = async () => {
    if (!orgId || !csvText) return;
    setLoading(true);
    setError(null);
    try {
      const cleanedMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, header]) => Boolean(header))
      );
      const res = await fetch('/api/contacts/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          csvText,
          mapping: cleanedMapping,
          dedupeMode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Import failed');
      setSummary(json.data.summary as Summary);
      setFailedRowsCsv(json.data.failedRowsCsv ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadFailedRows = () => {
    if (!failedRowsCsv) return;
    const blob = new Blob([failedRowsCsv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contacts-import-failed.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Step {step} of {STEP_LABELS.length}</p>
        <p className="text-lg font-semibold text-text-primary">{STEP_LABELS[step - 1]}</p>
        <p className="text-sm text-text-secondary">
          {step === 1 && 'Upload a CSV with header row to start mapping fields.'}
          {step === 2 && 'Match your columns to contact fields before importing.'}
          {step === 3 && 'Confirm validation rules and dedupe behavior.'}
          {step === 4 && 'Run the import and review results.'}
        </p>
        {!canImport && (
          <p className="text-xs text-text-tertiary">
            Admin access is required to execute imports. You can still preview and map the file.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {step === 1 && (
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">Upload CSV</p>
            <p className="text-sm text-text-secondary">CSV must include header row.</p>
          </div>
          <Input
            label="CSV file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
          />
          {fileName && <p className="text-xs text-text-tertiary">Selected: {fileName}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-tertiary">{orgId ? 'Org detected.' : 'Loading org...'}</span>
            <Button
              onClick={handlePreview}
              disabled={!file || !orgId || loading}
            >
              {loading ? 'Previewing...' : 'Preview and map'}
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && preview && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">Preview</p>
              <p className="text-xs text-text-tertiary">{preview.rowCount} rows detected.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>

          <div className="overflow-x-auto border border-border-subtle rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-bg-section/50">
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header} className="px-3 py-2 text-left text-text-tertiary">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.map((row, index) => (
                  <tr key={index} className="border-t border-border-subtle">
                    {preview.headers.map((header, columnIndex) => (
                      <td key={`${header}-${columnIndex}`} className="px-3 py-2 text-text-secondary">
                        {row[columnIndex] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FIELD_DEFS.map((field) => (
              <Select
                key={field.key}
                label={field.tooltip ? (
                  <span className="inline-flex items-center gap-1">
                    {field.label}
                    <InfoTooltip label={`${field.label} info`} content={<p className="text-xs text-text-secondary">{field.tooltip}</p>} />
                  </span>
                ) : field.label}
                value={mapping[field.key] ?? ''}
                onChange={(event) => updateMapping(field.key, event.target.value)}
              >
                <option value="">Not mapped</option>
                {headerOptions.map((header) => (
                  <option key={`${field.key}-${header}`} value={header}>
                    {header}
                  </option>
                ))}
              </Select>
            ))}
          </div>

          {!mappingReady && (
            <p className="text-sm text-destructive">Map full name or both first and last name to continue.</p>
          )}
          <p className="text-xs text-text-tertiary">
            Tags can include multiple values separated by commas or semicolons.
          </p>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={!mappingReady}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">Validation rules</p>
            <ul className="text-sm text-text-secondary list-disc pl-5 space-y-1">
              <li>Full name or first + last name is required.</li>
              <li>Email must be valid if provided.</li>
              <li>Date fields must parse (last_touch_at, next_touch_at).</li>
              <li>Duplicates are matched by email first, then phone.</li>
            </ul>
          </div>
          <Select
            label="Deduplication mode"
            value={dedupeMode}
            onChange={(event) => setDedupeMode(event.target.value as 'create_only' | 'upsert')}
          >
            {DEDUPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Run import</p>
            <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
              Back
            </Button>
          </div>
          {!summary ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Ready to import {preview?.rowCount ?? 0} rows.
              </p>
              <Button onClick={handleExecute} disabled={loading || !canImport}>
                {loading ? 'Importing...' : 'Run import'}
              </Button>
              {!canImport && (
                <p className="text-xs text-text-tertiary">Admin access is required to run this step.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">Import complete.</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border-subtle p-3">
                  <p className="text-xs text-text-tertiary">Created</p>
                  <p className="text-lg font-semibold text-text-primary">{summary.created}</p>
                </div>
                <div className="rounded-md border border-border-subtle p-3">
                  <p className="text-xs text-text-tertiary">Updated</p>
                  <p className="text-lg font-semibold text-text-primary">{summary.updated}</p>
                </div>
                <div className="rounded-md border border-border-subtle p-3">
                  <p className="text-xs text-text-tertiary">Skipped</p>
                  <p className="text-lg font-semibold text-text-primary">{summary.skipped}</p>
                </div>
                <div className="rounded-md border border-border-subtle p-3">
                  <p className="text-xs text-text-tertiary">Failed</p>
                  <p className="text-lg font-semibold text-text-primary">{summary.failed}</p>
                </div>
              </div>
              {failedRowsCsv && (
                <Button variant="secondary" onClick={downloadFailedRows}>
                  Download failed rows
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
