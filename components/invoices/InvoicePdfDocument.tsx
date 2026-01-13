/* eslint-disable jsx-a11y/alt-text */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InvoiceDocumentData } from '@/lib/invoices/document';
import { formatAddress, formatCurrency, formatInvoiceDate, formatQuantity, resolveBrandColor } from '@/lib/invoices/format';

type InvoicePdfDocumentProps = {
  data: InvoiceDocumentData;
};

function resolveAssetUrl(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(data:|https?:\/\/)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    return `${base.replace(/\/$/, '')}${trimmed}`;
  }
  return trimmed;
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
      marginBottom: 24,
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
    orgAddress: {
      fontSize: 9,
      color: '#64748b',
      marginTop: 2,
    },
    invoiceTitle: {
      fontSize: 22,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 1,
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
    statusPill: {
      marginTop: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      fontSize: 8,
      fontWeight: 700,
      color: '#475569',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    section: {
      marginTop: 18,
    },
    sectionTitle: {
      fontSize: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      color: '#94a3b8',
      marginBottom: 6,
    },
    infoCard: {
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 10,
      padding: 10,
      backgroundColor: '#f8fafc',
    },
    infoTitle: {
      fontSize: 10,
      fontWeight: 600,
      marginBottom: 4,
    },
    infoText: {
      fontSize: 9,
      color: '#475569',
    },
    summaryCard: {
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 10,
      padding: 10,
    },
    summaryText: {
      fontSize: 10,
      color: '#475569',
      lineHeight: 1.4,
    },
    table: {
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 10,
      overflow: 'hidden',
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: '#f8fafc',
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderTopWidth: 1,
      borderTopColor: '#e2e8f0',
    },
    cellDescription: {
      flex: 3,
      fontSize: 9,
      fontWeight: 600,
      color: '#0f172a',
    },
    cellSub: {
      fontSize: 8,
      color: '#94a3b8',
      marginTop: 2,
    },
    cellQty: {
      flex: 1,
      fontSize: 9,
      color: '#475569',
    },
    cellUnit: {
      flex: 1.2,
      fontSize: 9,
      color: '#475569',
    },
    cellTax: {
      flex: 1,
      fontSize: 9,
      color: '#475569',
    },
    cellTotal: {
      flex: 1.2,
      fontSize: 9,
      fontWeight: 600,
      color: '#0f172a',
      textAlign: 'right',
    },
    totalsWrap: {
      marginTop: 16,
      alignItems: 'flex-end',
    },
    totalsCard: {
      width: 220,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 10,
      padding: 10,
      backgroundColor: '#f8fafc',
    },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    totalsLabel: {
      fontSize: 9,
      color: '#64748b',
    },
    totalsValue: {
      fontSize: 9,
      fontWeight: 600,
      color: '#0f172a',
    },
    totalDivider: {
      height: 1,
      backgroundColor: '#e2e8f0',
      marginVertical: 6,
    },
    totalDue: {
      fontSize: 11,
      fontWeight: 700,
      color: accent,
    },
    footerNote: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 10,
      padding: 10,
      fontSize: 8,
      color: '#64748b',
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
    currencyBadge: {
      marginTop: 8,
      backgroundColor: accentSoft,
      color: '#1f2937',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      fontSize: 8,
      fontWeight: 700,
    },
  });

function getStatusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'issued' || normalized === 'sent') return 'Issued';
  if (normalized === 'partially_paid') return 'Partially paid';
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'overdue') return 'Overdue';
  if (normalized === 'void') return 'Void';
  return status;
}

export default function InvoicePdfDocument({ data }: InvoicePdfDocumentProps) {
  const accent = resolveBrandColor(data.org.brandPrimaryColor, '#111827');
  const accentSoft = resolveBrandColor(data.org.brandSecondaryColor, '#facc15');
  const styles = createStyles(accent, accentSoft);
  const invoiceDate = data.invoice.issuedAt ?? data.invoice.createdAt ?? null;
  const orgAddress = formatAddress(data.org.address);
  const jobAddress = formatAddress(data.job.address);
  const logoSrc = resolveAssetUrl(data.org.logoPath);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerLine} />
        {data.invoice.status.toLowerCase() === 'draft' && <Text style={styles.watermark}>Draft</Text>}

        <View style={styles.header}>
          <View style={styles.logoBlock}>
            {logoSrc ? (
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text>Logo</Text>
              </View>
            )}
            <View>
              <Text style={styles.orgName}>{data.org.name}</Text>
              {orgAddress ? <Text style={styles.orgAddress}>{orgAddress}</Text> : null}
            </View>
          </View>

          <View style={styles.headerMeta}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <Text style={styles.metaLabel}>Invoice number</Text>
            <Text style={styles.metaValue}>{data.invoice.number}</Text>
            <Text style={styles.metaLabel}>Issue date</Text>
            <Text style={styles.metaValue}>{formatInvoiceDate(invoiceDate)}</Text>
            <Text style={styles.metaLabel}>Due date</Text>
            <Text style={styles.metaValue}>{formatInvoiceDate(data.invoice.dueAt)}</Text>
            <Text style={styles.statusPill}>{getStatusLabel(data.invoice.status)}</Text>
            <Text style={styles.currencyBadge}>{data.invoice.currency}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill to</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{data.client?.name ?? 'Client'}</Text>
            {data.client?.email ? <Text style={styles.infoText}>{data.client.email}</Text> : null}
            {data.client?.phone ? <Text style={styles.infoText}>{data.client.phone}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Job</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{data.job.title}</Text>
            <Text style={styles.infoText}>Job ID: {data.job.id}</Text>
            {jobAddress ? <Text style={styles.infoText}>{jobAddress}</Text> : null}
          </View>
        </View>

        {data.invoice.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{data.invoice.summary}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Line items</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.cellDescription}>Description</Text>
              <Text style={styles.cellQty}>Qty</Text>
              <Text style={styles.cellUnit}>Unit</Text>
              <Text style={styles.cellTax}>Tax</Text>
              <Text style={styles.cellTotal}>Line total</Text>
            </View>
            {data.invoice.lineItems.length > 0 ? (
              data.invoice.lineItems.map((item, index) => (
                <View key={`${item.description}-${index}`} style={styles.tableRow}>
                  <View style={{ flex: 3 }}>
                    <Text style={styles.cellDescription}>{item.description}</Text>
                    {item.jobLinkType ? <Text style={styles.cellSub}>Linked: {item.jobLinkType}</Text> : null}
                  </View>
                  <Text style={styles.cellQty}>{formatQuantity(item.quantity)}</Text>
                  <Text style={styles.cellUnit}>{formatCurrency(item.unitPriceCents, data.invoice.currency)}</Text>
                  <Text style={styles.cellTax}>{item.taxRate === 10 ? 'GST 10%' : `${item.taxRate ?? 0}%`}</Text>
                  <Text style={styles.cellTotal}>{formatCurrency(item.totalCents, data.invoice.currency)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.tableRow}>
                <Text style={styles.infoText}>No billable items yet.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsCard}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{formatCurrency(data.invoice.subtotalCents, data.invoice.currency)}</Text>
            </View>
            {data.taxBreakdown.length > 0 ? (
              data.taxBreakdown.map((tax) => (
                <View key={tax.rate} style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>{tax.rate === 10 ? 'GST 10%' : `Tax ${tax.rate}%`}</Text>
                  <Text style={styles.totalsValue}>{formatCurrency(tax.cents, data.invoice.currency)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax</Text>
                <Text style={styles.totalsValue}>{formatCurrency(0, data.invoice.currency)}</Text>
              </View>
            )}
            <View style={styles.totalDivider} />
            <View style={styles.totalsRow}>
              <Text style={styles.totalDue}>Total due</Text>
              <Text style={styles.totalDue}>{formatCurrency(data.invoice.totalCents, data.invoice.currency)}</Text>
            </View>
          </View>
          <Text style={{ marginTop: 8, fontSize: 8, color: '#64748b' }}>
            Payment due by {formatInvoiceDate(data.invoice.dueAt)} ({data.invoice.currency})
          </Text>
        </View>

        <View style={styles.footerNote}>
          <Text>Please contact {data.org.name} if you have any questions about this invoice.</Text>
        </View>
      </Page>
    </Document>
  );
}
