import VendorReportPdfDocument from '@/components/reports/VendorReportPdfDocument';
import { getDb } from '@/lib/db';
import { listingReports } from '@/db/schema/listing_reports';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { users } from '@/db/schema/users';
import { eq } from 'drizzle-orm';
import { renderPdfToBuffer, resolvePdfImageDataUrl } from '@/lib/invoices/pdf';

export const runtime = 'nodejs';

function sanitizeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!token) {
    return new Response('Invalid report link', { status: 404 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      payload: listingReports.payloadJson,
      orgName: orgs.name,
      orgLogo: orgs.logoPath,
      brandPrimaryColor: orgs.brandPrimaryColor,
      brandSecondaryColor: orgs.brandSecondaryColor,
      companyName: orgSettings.companyName,
      companyLogoPath: orgSettings.companyLogoPath,
      createdByName: users.name,
      createdByEmail: users.email,
    })
    .from(listingReports)
    .innerJoin(orgs, eq(listingReports.orgId, orgs.id))
    .leftJoin(orgSettings, eq(orgSettings.orgId, orgs.id))
    .leftJoin(users, eq(listingReports.createdByUserId, users.id))
    .where(eq(listingReports.shareToken, token))
    .limit(1);

  if (!row) {
    return new Response('Report not found', { status: 404 });
  }

  const orgName = row.companyName ?? row.orgName ?? 'Vendor report';
  const orgLogo = row.companyLogoPath ?? row.orgLogo ?? null;
  const payload = (row.payload as Record<string, unknown>) ?? {};
  const origin = new URL(req.url).origin;
  const logoDataUrl = await resolvePdfImageDataUrl(orgLogo, origin);
  const createdBy =
    row.createdByName || row.createdByEmail ? { name: row.createdByName ?? null, email: row.createdByEmail ?? null } : null;

  const pdfData = {
    org: {
      name: orgName,
      logoPath: logoDataUrl ?? null,
      brandPrimaryColor: row.brandPrimaryColor ?? null,
      brandSecondaryColor: row.brandSecondaryColor ?? null,
    },
    payload: payload as any,
    createdBy,
  };

  const doc = VendorReportPdfDocument({ data: pdfData });
  const buffer = await renderPdfToBuffer(doc);
  const listingAddress = (payload as any)?.listing?.address ?? 'report';
  const safeName = sanitizeFilename(String(listingAddress || 'report'));
  const filename = `vendor-report-${safeName || 'report'}.pdf`;

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
