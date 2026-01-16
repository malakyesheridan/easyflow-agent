export type VendorReportSections = Record<string, boolean>;

export type VendorReportBranding = {
  showLogo?: boolean;
  headerStyle?: 'compact' | 'full';
  accentColor?: string | null;
  logoPosition?: 'left' | 'center' | 'right';
};

export type VendorReportPayload = {
  generatedAt: string;
  template: {
    id: string;
    name: string;
    sections: VendorReportSections;
    prompts: Record<string, string>;
    branding: VendorReportBranding;
  } | null;
  sections: VendorReportSections;
  branding: VendorReportBranding;
  listing: {
    address: string;
    suburb: string;
    status: string;
    listedAt: string | null;
    daysOnMarket: number;
    priceGuideMin: number | null;
    priceGuideMax: number | null;
    propertyType: string | null;
    beds: number | null;
    baths: number | null;
    cars: number | null;
  };
  campaignHealth: {
    score: number | null;
    reasons: string[];
  };
  milestones: {
    total: number;
    completed: number;
    overdue: number;
    items: Array<{
      name: string;
      targetDueAt: string | null;
      completedAt: string | null;
    }>;
  };
  checklist: {
    total: number;
    completed: number;
  };
  activity: {
    enquiriesLast7: number;
    enquiriesLast14: number;
    inspectionsLast7: number;
    inspectionsLast14: number;
    offers: number;
  };
  buyerPipeline: Record<string, number>;
  commentary: string;
  recommendations: string;
  feedbackThemes: string;
  marketingChannels: string;
  comparableSales: string;
  deliveryMethod: string;
  cadence: {
    lastSentAt: string | null;
    nextDueAt: string | null;
    cadenceType: string | null;
  };
};

export type VendorReportDocumentData = {
  org: {
    name: string;
    logoPath: string | null;
    brandPrimaryColor: string | null;
    brandSecondaryColor: string | null;
  };
  payload: VendorReportPayload;
  createdBy?: { name: string | null; email: string | null } | null;
  isDraft?: boolean;
};
