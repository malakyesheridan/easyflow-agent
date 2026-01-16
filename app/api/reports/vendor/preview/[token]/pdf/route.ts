import VendorReportPdfDocument from '@/components/reports/VendorReportPdfDocument';
import { getDb } from '@/lib/db';
import { reportDrafts } from '@/db/schema/report_drafts';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { and, eq, gt } from 'drizzle-orm';
import { hashToken } from '@/lib/security/tokens';
import { renderPdfToBuffer, resolvePdfImageDataUrl } from '@/lib/invoices/pdf';
import { requireOrgContext } from '@/lib/auth/require';

export const runtime = 'nodejs';

function sanitizeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!token) {
    return new Response('Invalid report preview link', { status: 404 });
  }

  const tokenHash = hashToken(token);
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select({
      orgId: reportDrafts.orgId,
      payload: reportDrafts.payloadJson,
      orgName: orgs.name,
      orgLogo: orgs.logoPath,
      brandPrimaryColor: orgs.brandPrimaryColor,
      brandSecondaryColor: orgs.brandSecondaryColor,
      companyName: orgSettings.companyName,
      companyLogoPath: orgSettings.companyLogoPath,
    })
    .from(reportDrafts)
    .innerJoin(orgs, eq(reportDrafts.orgId, orgs.id))
    .leftJoin(orgSettings, eq(orgSettings.orgId, orgs.id))
    .where(and(eq(reportDrafts.tokenHash, tokenHash), gt(reportDrafts.expiresAt, now)))
    .limit(1);

  if (!row) {
    return new Response('Report preview not found', { status: 404 });
  }

  const orgContext = await requireOrgContext(req, String(row.orgId));
  if (!orgContext.ok) {
    return new Response('Unauthorized', { status: 401 });
  }

  const orgName = row.companyName ?? row.orgName ?? 'Vendor report';
  const orgLogo = row.companyLogoPath ?? row.orgLogo ?? null;
  const payload = (row.payload as Record<string, unknown>) ?? {};
  const origin = new URL(req.url).origin;
  const logoDataUrl = await resolvePdfImageDataUrl(orgLogo, origin);

  const pdfData = {
    org: {
      name: orgName,
      logoPath: logoDataUrl ?? null,
      brandPrimaryColor: row.brandPrimaryColor ?? null,
      brandSecondaryColor: row.brandSecondaryColor ?? null,
    },
    payload: payload as any,
    isDraft: true,
  };

  const doc = VendorReportPdfDocument({ data: pdfData });
  const buffer = await renderPdfToBuffer(doc);
  const listingAddress = (payload as any)?.listing?.address ?? 'report';
  const safeName = sanitizeFilename(String(listingAddress || 'report'));
  const filename = `vendor-report-preview-${safeName || 'report'}.pdf`;

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
