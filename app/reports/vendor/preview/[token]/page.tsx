import { headers } from 'next/headers';
import { Card, PageContainer } from '@/components/ui';
import VendorReportPreviewDocument from '@/components/reports/VendorReportPreviewDocument';
import { getDb } from '@/lib/db';
import { reportDrafts } from '@/db/schema/report_drafts';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { and, eq, gt } from 'drizzle-orm';
import { hashToken } from '@/lib/security/tokens';
import { getSessionContext } from '@/lib/auth/session';

interface VendorReportPreviewPageProps {
  params: Promise<{ token: string }>;
}

export default async function VendorReportPreviewPage({ params }: VendorReportPreviewPageProps) {
  const { token } = await params;
  if (!token) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">Invalid report preview link.</p>
        </Card>
      </PageContainer>
    );
  }

  const cookie = headers().get('cookie') ?? '';
  const session = await getSessionContext(new Request('http://localhost', { headers: { cookie } }));
  if (!session) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">You do not have access to this report preview.</p>
        </Card>
      </PageContainer>
    );
  }

  const tokenHash = hashToken(token);
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select({
      orgId: reportDrafts.orgId,
      listingId: reportDrafts.listingId,
      payload: reportDrafts.payloadJson,
      expiresAt: reportDrafts.expiresAt,
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

  if (!row || String(row.orgId) !== session.org.id) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">This report preview link is invalid or has expired.</p>
        </Card>
      </PageContainer>
    );
  }

  const orgName = row.companyName ?? row.orgName ?? 'Vendor report';
  const orgLogo = row.companyLogoPath ?? row.orgLogo ?? null;
  const payload = (row.payload as Record<string, unknown>) ?? {};

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
        createdBy: { name: session.user.name, email: session.user.email },
        isDraft: true,
      }}
      showActions
      showBackLink
      backHref={`/listings/${row.listingId}?tab=reports`}
      pdfUrl={`/api/reports/vendor/preview/${token}/pdf`}
    />
  );
}
