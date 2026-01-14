import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { parseCsv } from '@/lib/utils/csv';

export const POST = withRoute(async (req: Request) => {
  const formData = await req.formData();
  const orgId = formData.get('orgId');
  const file = formData.get('file');

  if (!orgId || typeof orgId !== 'string') {
    return err('VALIDATION_ERROR', 'orgId is required');
  }

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  if (!file || !(file instanceof File)) {
    return err('VALIDATION_ERROR', 'CSV file is required');
  }

  const text = await file.text();
  const parsed = parseCsv(text);

  if (parsed.headers.length === 0) {
    return err('VALIDATION_ERROR', 'CSV must include header row');
  }

  const sampleRows = parsed.rows.slice(0, 5);

  return ok({
    headers: parsed.headers,
    sampleRows,
    rowCount: parsed.rows.length,
  });
});
