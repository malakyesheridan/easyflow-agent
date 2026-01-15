type ListingInput = {
  listedAt: Date | null;
  createdAt: Date | null;
  status: string | null;
};

type ChecklistItem = { isDone: boolean; dueAt: Date | null };
type MilestoneItem = { targetDueAt: Date | null; completedAt: Date | null };
type EnquiryItem = { occurredAt: Date };
type InspectionItem = { startsAt: Date };
type BuyerItem = { status: string | null; nextFollowUpAt: Date | null };
type VendorCommItem = { occurredAt: Date };

type CampaignHealthInput = {
  listing: ListingInput;
  milestones: MilestoneItem[];
  checklist: ChecklistItem[];
  enquiries: EnquiryItem[];
  inspections: InspectionItem[];
  buyers: BuyerItem[];
  vendorComms: VendorCommItem[];
  now?: Date;
};

type CampaignHealthResult = {
  score: number;
  band: 'healthy' | 'watch' | 'stalling';
  reasons: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(now: Date, then: Date) {
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

export function scoreCampaignHealth(input: CampaignHealthInput): CampaignHealthResult {
  const now = input.now ?? new Date();
  const baseDate = input.listing.listedAt ?? input.listing.createdAt ?? now;
  const domDays = daysBetween(now, baseDate);
  const reasons = new Map<string, number>();

  const add = (reason: string, weight: number) => {
    if (!weight) return;
    reasons.set(reason, (reasons.get(reason) ?? 0) + weight);
  };

  let score = 50;

  const totalChecklist = input.checklist.length;
  const completedChecklist = input.checklist.filter((item) => item.isDone).length;
  if (totalChecklist > 0) {
    const completion = completedChecklist / totalChecklist;
    const weight = Math.round(15 * completion);
    score += weight;
    add('Checklist progress', weight);
  }

  const milestonesWithTargets = input.milestones.filter((m) => m.targetDueAt);
  if (milestonesWithTargets.length > 0) {
    const onTime = milestonesWithTargets.filter((m) => m.completedAt && m.targetDueAt && m.completedAt <= m.targetDueAt).length;
    const ratio = onTime / milestonesWithTargets.length;
    const weight = Math.round(20 * ratio);
    score += weight;
    add('Milestones on track', weight);
  }

  const enquiries7d = input.enquiries.filter((e) => now.getTime() - e.occurredAt.getTime() <= DAY_MS * 7).length;
  if (enquiries7d > 0) {
    const weight = Math.min(10, enquiries7d * 3);
    score += weight;
    add('Buyer activity', weight);
  }

  const inspections14d = input.inspections.filter((i) => now.getTime() - i.startsAt.getTime() <= DAY_MS * 14).length;
  if (inspections14d > 0) {
    const weight = Math.min(10, inspections14d * 5);
    score += weight;
    add('Inspections activity', weight);
  }

  const hasOffer = input.buyers.some((buyer) => buyer.status === 'offer_made');
  if (hasOffer) {
    score += 20;
    add('Offer received', 20);
  }

  const lastVendorComm = input.vendorComms
    .map((comm) => comm.occurredAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (lastVendorComm) {
    const daysSinceUpdate = daysBetween(now, lastVendorComm);
    if (daysSinceUpdate > 7) {
      score -= 10;
      add('Vendor update overdue', -10);
    }
  }

  const overdueMilestones = input.milestones.filter((m) => m.targetDueAt && !m.completedAt && m.targetDueAt < now);
  if (overdueMilestones.length > 0) {
    const penalty = overdueMilestones.length >= 3 ? -25 : overdueMilestones.length === 2 ? -20 : -10;
    score += penalty;
    add('Milestones overdue', penalty);
  }

  const enquiries14d = input.enquiries.filter((e) => now.getTime() - e.occurredAt.getTime() <= DAY_MS * 14).length;
  if (domDays > 21 && enquiries14d < 2) {
    score -= 10;
    add('Low enquiry for DOM', -10);
  }
  if (domDays > 30 && !hasOffer) {
    score -= 10;
    add('Stalling—no offers', -10);
  }

  const overdueFollowups = input.buyers.filter((buyer) => {
    if (!buyer.nextFollowUpAt) return false;
    if (buyer.status === 'not_interested') return false;
    return buyer.nextFollowUpAt.getTime() < now.getTime();
  });
  if (overdueFollowups.length > 0) {
    score -= 10;
    add('Buyer follow-ups overdue', -10);
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const band: CampaignHealthResult['band'] = clamped >= 70 ? 'healthy' : clamped >= 40 ? 'watch' : 'stalling';
  const sortedReasons = Array.from(reasons.entries())
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6)
    .map(([reason]) => reason);

  return {
    score: clamped,
    band,
    reasons: sortedReasons,
  };
}
