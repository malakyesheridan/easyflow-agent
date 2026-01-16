import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { listingReports } from '@/db/schema/listing_reports';
import { listings } from '@/db/schema/listings';
import { contacts } from '@/db/schema/contacts';
import { reportTemplates } from '@/db/schema/report_templates';
import { users } from '@/db/schema/users';
import { getBaseUrl } from '@/lib/url';

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function buildShareUrl(token: string, req?: Request) {
  const baseUrl = getBaseUrl(req);
  return `${baseUrl.replace(/\/$/, '')}/reports/vendor/${token}`;
}

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const listingId = searchParams.get('listingId');
  const agentId = searchParams.get('agentId');
  const templateId = searchParams.get('templateId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? 20)));

  const conditions = [eq(listingReports.orgId, orgContext.data.orgId)];
  if (listingId) conditions.push(eq(listingReports.listingId, listingId));
  if (agentId) conditions.push(eq(listingReports.createdByUserId, agentId));
  if (templateId) conditions.push(eq(listingReports.templateId, templateId));
  if (startDate) {
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime())) conditions.push(gte(listingReports.createdAt, start));
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) conditions.push(lte(listingReports.createdAt, end));
  }

  const db = getDb();
  const rows = await db
    .select({
      id: listingReports.id,
      createdAt: listingReports.createdAt,
      shareToken: listingReports.shareToken,
      deliveryMethod: listingReports.deliveryMethod,
      templateName: reportTemplates.name,
      templateId: reportTemplates.id,
      listingId: listings.id,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      vendorName: contacts.fullName,
      createdByUserId: users.id,
      createdByName: users.name,
      createdByEmail: users.email,
    })
    .from(listingReports)
    .leftJoin(reportTemplates, eq(listingReports.templateId, reportTemplates.id))
    .leftJoin(listings, eq(listingReports.listingId, listings.id))
    .leftJoin(contacts, eq(listings.vendorContactId, contacts.id))
    .leftJoin(users, eq(listingReports.createdByUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(listingReports.createdAt), asc(listingReports.id))
    .limit(limit);

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      createdAt: toIso(row.createdAt),
      shareUrl: buildShareUrl(row.shareToken, req),
      deliveryMethod: row.deliveryMethod ?? null,
      template: row.templateId ? { id: String(row.templateId), name: row.templateName ?? '' } : null,
      listing: row.listingId
        ? { id: String(row.listingId), address: row.addressLine1 ?? '', suburb: row.suburb ?? '' }
        : null,
      vendorName: row.vendorName ?? null,
      createdBy: row.createdByUserId
        ? { id: String(row.createdByUserId), name: row.createdByName ?? null, email: row.createdByEmail ?? null }
        : null,
    }))
  );
});
