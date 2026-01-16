/* eslint-disable jsx-a11y/alt-text */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { resolveBrandColor } from '@/lib/invoices/format';
import { normalizeVendorReportPayload } from '@/lib/reports/document';
import type { VendorReportDocumentData } from '@/lib/reports/types';

type VendorReportPdfDocumentProps = {
  data: VendorReportDocumentData;
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatPrice(value?: number | null) {
  if (value === null || value === undefined) return '-';
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
    value
  );
}

function formatPriceRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return '-';
  if (min != null && max != null) return `${formatPrice(min)} - ${formatPrice(max)}`;
  return formatPrice(min ?? max ?? null);
}

const createStyles = (accent: string, accentSoft: string) =>
  StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 10,
      fontFamily: 'Helvetica',
      color: '#0f172a',
      position: 'relative',
    },
    headerLine: {
      height: 4,
      width: '100%',
      backgroundColor: accent,
      marginBottom: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
    },
    logoBlock: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      flexGrow: 1,
    },
    logo: {
      width: 48,
      height: 48,
      borderRadius: 8,
      objectFit: 'cover',
      borderWidth: 1,
      borderColor: '#e2e8f0',
    },
    logoPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#94a3b8',
      fontSize: 8,
    },
    orgName: {
      fontSize: 16,
      fontWeight: 700,
    },
    orgSub: {
      fontSize: 9,
      color: '#64748b',
      marginTop: 2,
    },
    reportTitle: {
      fontSize: 22,
      fontWeight: 700,
      color: accent,
    },
    reportTitleCompact: {
      fontSize: 18,
      fontWeight: 700,
      color: accent,
    },
    headerMeta: {
      alignItems: 'flex-end',
      gap: 4,
    },
    metaLabel: {
      fontSize: 8,
      color: '#94a3b8',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    metaValue: {
      fontSize: 11,
      fontWeight: 600,
      color: '#1f2937',
    },
    section: {
      marginTop: 16,
    },
    sectionTitle: {
      fontSize: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      color: '#94a3b8',
      marginBottom: 6,
    },
    cardRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    card: {
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 10,
      padding: 10,
      minWidth: 150,
      flexGrow: 1,
    },
    cardMuted: {
      backgroundColor: '#f8fafc',
    },
    cardLabel: {
      fontSize: 8,
      color: '#94a3b8',
    },
    cardValue: {
      fontSize: 14,
      fontWeight: 700,
      marginTop: 4,
    },
    note: {
      fontSize: 9,
      color: '#475569',
      marginTop: 6,
      lineHeight: 1.4,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 6,
    },
    chip: {
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2,
      fontSize: 7,
      color: '#475569',
    },
    listItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 8,
      color: '#475569',
      paddingVertical: 2,
    },
    footer: {
      marginTop: 16,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 10,
      padding: 10,
      fontSize: 8,
      color: '#64748b',
      backgroundColor: '#f8fafc',
    },
    watermark: {
      position: 'absolute',
      top: 180,
      right: 40,
      fontSize: 46,
      color: '#e2e8f0',
      transform: 'rotate(12deg)',
      textTransform: 'uppercase',
      letterSpacing: 6,
    },
    accentBadge: {
      marginTop: 6,
      backgroundColor: accentSoft,
      color: '#1f2937',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      fontSize: 8,
      fontWeight: 700,
    },
  });

export default function VendorReportPdfDocument({ data }: VendorReportPdfDocumentProps) {
  const payload = normalizeVendorReportPayload(data.payload);
  const accent = resolveBrandColor(payload.branding.accentColor ?? data.org.brandPrimaryColor, '#0f172a');
  const accentSoft = resolveBrandColor(data.org.brandSecondaryColor, '#f1f5f9');
  const styles = createStyles(accent, accentSoft);

  const showLogo = payload.branding.showLogo !== false;
  const logoPosition = payload.branding.logoPosition ?? 'left';
  const headerStyle = payload.branding.headerStyle ?? 'full';
  const logoJustify = logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'flex-end' : 'flex-start';
  const orgTextAlign = logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'right' : 'left';

  const listingTitle = `${payload.listing.address ?? ''} ${payload.listing.suburb ?? ''}`.trim();
  const reportTitleStyle = headerStyle === 'compact' ? styles.reportTitleCompact : styles.reportTitle;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerLine} />
        {data.isDraft && <Text style={styles.watermark}>Draft</Text>}

        <View style={styles.header}>
          <View style={[styles.logoBlock, { justifyContent: logoJustify }]}>
            {showLogo ? (
              data.org.logoPath ? (
                <Image src={data.org.logoPath} style={styles.logo} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text>Logo</Text>
                </View>
              )
            ) : null}
            <View>
              <Text style={[styles.orgName, { textAlign: orgTextAlign }]}>{data.org.name}</Text>
              <Text style={[styles.orgSub, { textAlign: orgTextAlign }]}>
                {listingTitle || 'Vendor campaign report'}
              </Text>
            </View>
          </View>

          <View style={styles.headerMeta}>
            <Text style={reportTitleStyle}>Vendor report</Text>
            <Text style={styles.metaLabel}>Generated</Text>
            <Text style={styles.metaValue}>{formatDate(payload.generatedAt)}</Text>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>{payload.listing.status.replace(/_/g, ' ')}</Text>
            <Text style={styles.accentBadge}>{payload.cadence.cadenceType ?? 'cadence'}</Text>
          </View>
        </View>

        {payload.sections.campaignSnapshot && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Campaign snapshot</Text>
            <View style={styles.cardRow}>
              <View style={[styles.card, styles.cardMuted]}>
                <Text style={styles.cardLabel}>Days on market</Text>
                <Text style={styles.cardValue}>{payload.listing.daysOnMarket ?? 0}</Text>
              </View>
              <View style={[styles.card, styles.cardMuted]}>
                <Text style={styles.cardLabel}>Campaign health</Text>
                <Text style={styles.cardValue}>{payload.campaignHealth.score ?? 0}</Text>
                {payload.campaignHealth.reasons.length > 0 && (
                  <View style={styles.chipRow}>
                    {payload.campaignHealth.reasons.slice(0, 4).map((reason) => (
                      <Text key={reason} style={styles.chip}>{reason}</Text>
                    ))}
                  </View>
                )}
              </View>
              <View style={[styles.card, styles.cardMuted]}>
                <Text style={styles.cardLabel}>Price guide</Text>
                <Text style={styles.cardValue}>
                  {formatPriceRange(payload.listing.priceGuideMin, payload.listing.priceGuideMax)}
                </Text>
                <Text style={styles.note}>{payload.listing.propertyType ?? 'Property'}</Text>
              </View>
            </View>
            <View style={[styles.cardRow, { marginTop: 8 }]}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Last report</Text>
                <Text style={styles.cardValue}>{formatDate(payload.cadence.lastSentAt)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Next due</Text>
                <Text style={styles.cardValue}>{formatDate(payload.cadence.nextDueAt)}</Text>
              </View>
            </View>
          </View>
        )}

        {payload.sections.buyerActivitySummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Buyer activity</Text>
            <View style={styles.cardRow}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Enquiries (7d)</Text>
                <Text style={styles.cardValue}>{payload.activity.enquiriesLast7}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Enquiries (14d)</Text>
                <Text style={styles.cardValue}>{payload.activity.enquiriesLast14}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Inspections (7d)</Text>
                <Text style={styles.cardValue}>{payload.activity.inspectionsLast7}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Offers</Text>
                <Text style={styles.cardValue}>{payload.activity.offers}</Text>
              </View>
            </View>
          </View>
        )}

        {payload.sections.milestonesProgress && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Milestones and checklist</Text>
            <View style={styles.cardRow}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Milestones completed</Text>
                <Text style={styles.cardValue}>
                  {payload.milestones.completed} / {payload.milestones.total}
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Checklist progress</Text>
                <Text style={styles.cardValue}>
                  {payload.checklist.completed} / {payload.checklist.total}
                </Text>
              </View>
            </View>
            {payload.milestones.items.length > 0 && (
              <View style={[styles.card, { marginTop: 8 }]}>
                {payload.milestones.items.slice(0, 6).map((item) => (
                  <View key={item.name} style={styles.listItem}>
                    <Text>{item.name}</Text>
                    <Text>{item.completedAt ? 'Completed' : item.targetDueAt ? `Due ${formatDate(item.targetDueAt)}` : 'Pending'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {payload.sections.buyerPipelineBreakdown && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Buyer pipeline</Text>
            <View style={styles.cardRow}>
              {Object.entries(payload.buyerPipeline).length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.note}>No buyer pipeline activity recorded.</Text>
                </View>
              ) : (
                Object.entries(payload.buyerPipeline).map(([status, count]) => (
                  <View key={status} style={styles.card}>
                    <Text style={styles.cardLabel}>{status.replace(/_/g, ' ')}</Text>
                    <Text style={styles.cardValue}>{count}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Agent commentary</Text>
          <View style={styles.card}>
            <Text style={styles.note}>{payload.commentary || 'No commentary provided.'}</Text>
          </View>
        </View>

        {payload.sections.recommendations && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            <View style={styles.card}>
              <Text style={styles.note}>{payload.recommendations || 'No recommendations provided.'}</Text>
            </View>
          </View>
        )}

        {payload.sections.feedbackThemes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Feedback themes</Text>
            <View style={styles.card}>
              <Text style={styles.note}>{payload.feedbackThemes || 'No feedback themes provided.'}</Text>
            </View>
          </View>
        )}

        {payload.sections.marketingChannels && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Marketing channels</Text>
            <View style={styles.card}>
              <Text style={styles.note}>{payload.marketingChannels || 'No marketing channels listed.'}</Text>
            </View>
          </View>
        )}

        {payload.sections.comparableSales && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comparable sales</Text>
            <View style={styles.card}>
              <Text style={styles.note}>{payload.comparableSales || 'No comparable sales noted.'}</Text>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Text>
            Generated {formatDate(payload.generatedAt)} - Delivered via {payload.deliveryMethod.replace(/_/g, ' ')}
            {data.createdBy?.name || data.createdBy?.email ? ` - Prepared by ${data.createdBy.name || data.createdBy.email}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
