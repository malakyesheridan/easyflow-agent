export const DEFAULT_VENDOR_REPORT_SECTIONS = {
  campaignSnapshot: true,
  milestonesProgress: true,
  buyerActivitySummary: true,
  buyerPipelineBreakdown: true,
  feedbackThemes: true,
  recommendations: true,
  marketingChannels: true,
  comparableSales: true,
};

export const VENDOR_REPORT_SECTION_LABELS = [
  {
    key: 'campaignSnapshot',
    label: 'Campaign snapshot',
    tooltip: 'Status, days on market, price guide, and campaign health.',
  },
  {
    key: 'milestonesProgress',
    label: 'Milestones progress',
    tooltip: 'Milestones and checklist completion status.',
  },
  {
    key: 'buyerActivitySummary',
    label: 'Buyer activity summary',
    tooltip: 'Recent enquiries, inspections, and offers.',
  },
  {
    key: 'buyerPipelineBreakdown',
    label: 'Buyer pipeline breakdown',
    tooltip: 'Counts by buyer status for this listing.',
  },
  {
    key: 'feedbackThemes',
    label: 'Feedback themes',
    tooltip: 'Key objections and feedback from buyers.',
  },
  {
    key: 'recommendations',
    label: 'Recommendations',
    tooltip: 'Next actions or decisions to improve outcomes.',
  },
  {
    key: 'marketingChannels',
    label: 'Marketing channels',
    tooltip: 'Where the campaign is being promoted.',
  },
  {
    key: 'comparableSales',
    label: 'Comparable sales',
    tooltip: 'Relevant recent sales for context.',
  },
] as const;
