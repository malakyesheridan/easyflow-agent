import { Card, PageContainer } from '@/components/ui';
import VendorReportPreviewDocument from '@/components/reports/VendorReportPreviewDocument';
import { getDb } from '@/lib/db';
import { listingReports } from '@/db/schema/listing_reports';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { users } from '@/db/schema/users';
import { eq } from 'drizzle-orm';

interface VendorReportPageProps {
  params: Promise<{ token: string }>;
}

export default async function VendorReportPage({ params }: VendorReportPageProps) {
  const { token } = await params;
  if (!token) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">Invalid vendor report link.</p>
        </Card>
      </PageContainer>
    );
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
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">This vendor report link is invalid or has expired.</p>
        </Card>
      </PageContainer>
    );
  }

  const payload = (row.payload as Record<string, unknown>) ?? {};
  const orgName = row.companyName ?? row.orgName ?? 'Vendor report';
  const orgLogo = row.companyLogoPath ?? row.orgLogo ?? null;
  const createdBy =
    row.createdByName || row.createdByEmail
      ? { name: row.createdByName ?? null, email: row.createdByEmail ?? null }
      : null;

  return (
    <VendorReportPreviewDocument
      data={{
        org: {
          name: orgName,
          logoPath: orgLogo,
          brandPrimaryColor: row.brandPrimaryColor ?? null,
          brandSecondaryColor: row.brandSecondaryColor ?? null,
        },
        payload: payload as any,
        createdBy,
      }}
      showActions
      showBackLink={false}
      pdfUrl={`/api/reports/vendor/${token}/pdf`}
    />
  );
}
