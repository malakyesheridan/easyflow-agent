export type WinProbabilityBand = 'hot' | 'warm' | 'cold';

export type WinProbabilityScore = {
  score: number;
  band: WinProbabilityBand;
  reasons: string[];
};

export type AppraisalForScoring = {
  appointmentAt: Date | null;
  stage: string;
  motivation: string | null;
  timeline: string | null;
  priceExpectationMin: number | null;
  priceExpectationMax: number | null;
  decisionMakersPresent: boolean;
  objections: string[] | string | null;
  outcomeStatus: string;
};

export type ContactForScoring = {
  leadSource: string | null;
  tags: string[];
};

export type ChecklistItemForScoring = {
  isDone: boolean;
  dueAt: Date | null;
};

type Reason = { label: string; weight: number };

type WinProbabilityConfig = {
  weights: {
    booked: number;
    confirmed: number;
    decisionMakers: number;
    motivation: number;
    timelineStrongAsap: number;
    timelineStrong30: number;
    priceExpectation: number;
    objections: number;
    pastClient: number;
    referral: number;
    followupPlan: number;
    checklistMax: number;
    overduePenalty: number;
  };
  pastClientTags: string[];
  referralLeadSources: string[];
  bandThresholds: {
    hot: number;
    warm: number;
  };
};

const DEFAULT_CONFIG: WinProbabilityConfig = {
  weights: {
    booked: 10,
    confirmed: 10,
    decisionMakers: 15,
    motivation: 10,
    timelineStrongAsap: 15,
    timelineStrong30: 10,
    priceExpectation: 10,
    objections: 5,
    pastClient: 15,
    referral: 10,
    followupPlan: 10,
    checklistMax: 20,
    overduePenalty: -10,
  },
  pastClientTags: ['past client', 'past clients'],
  referralLeadSources: ['referral'],
  bandThresholds: {
    hot: 75,
    warm: 45,
  },
};

const STAGE_ORDER = [
  'booked',
  'confirmed',
  'prepped',
  'attended',
  'followup_sent',
  'won',
  'lost',
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function addReason(reasons: Reason[], label: string, weight: number) {
  reasons.push({ label, weight });
}

function hasObjections(objections: AppraisalForScoring['objections']) {
  if (!objections) return false;
  if (Array.isArray(objections)) return objections.some((item) => item.trim().length > 0);
  return objections.trim().length > 0;
}

export function scoreWinProbability(
  appraisal: AppraisalForScoring,
  checklistItems: ChecklistItemForScoring[],
  contact: ContactForScoring,
  followupCount: number,
  now: Date,
  config: WinProbabilityConfig = DEFAULT_CONFIG
): WinProbabilityScore {
  const reasons: Reason[] = [];

  if (appraisal.outcomeStatus === 'lost') {
    return { score: 0, band: 'cold', reasons: ['Outcome lost'] };
  }
  if (appraisal.outcomeStatus === 'won') {
    return { score: 100, band: 'hot', reasons: ['Won'] };
  }

  let score = 0;

  if (appraisal.appointmentAt) {
    score += config.weights.booked;
    addReason(reasons, 'Booked in', config.weights.booked);
  }

  const stageIndex = STAGE_ORDER.indexOf(normalize(appraisal.stage));
  if (stageIndex >= STAGE_ORDER.indexOf('confirmed') && stageIndex !== -1) {
    score += config.weights.confirmed;
    addReason(reasons, 'Confirmed', config.weights.confirmed);
  }

  if (appraisal.decisionMakersPresent) {
    score += config.weights.decisionMakers;
    addReason(reasons, 'Decision makers present', config.weights.decisionMakers);
  }

  if (appraisal.motivation && appraisal.motivation.trim().length > 0) {
    score += config.weights.motivation;
    addReason(reasons, 'Motivation captured', config.weights.motivation);
  }

  const timeline = appraisal.timeline ? normalize(appraisal.timeline) : '';
  if (timeline === 'asap') {
    score += config.weights.timelineStrongAsap;
    addReason(reasons, 'Strong timeline', config.weights.timelineStrongAsap);
  } else if (timeline === 'days_30') {
    score += config.weights.timelineStrong30;
    addReason(reasons, 'Strong timeline', config.weights.timelineStrong30);
  }

  if (appraisal.priceExpectationMin !== null || appraisal.priceExpectationMax !== null) {
    score += config.weights.priceExpectation;
    addReason(reasons, 'Price expectation captured', config.weights.priceExpectation);
  }

  if (hasObjections(appraisal.objections)) {
    score += config.weights.objections;
    addReason(reasons, 'Objections identified', config.weights.objections);
  }

  const tagSet = new Set(contact.tags.map((tag) => normalize(tag)));
  const isPastClient = config.pastClientTags.some((tag) => tagSet.has(tag));
  if (isPastClient) {
    score += config.weights.pastClient;
    addReason(reasons, 'Past client', config.weights.pastClient);
  }

  const leadSource = contact.leadSource ? normalize(contact.leadSource) : '';
  if (leadSource && config.referralLeadSources.includes(leadSource)) {
    score += config.weights.referral;
    addReason(reasons, 'Referral', config.weights.referral);
  }

  const totalChecklist = checklistItems.length;
  const completedChecklist = checklistItems.filter((item) => item.isDone).length;
  if (totalChecklist > 0) {
    const progressScore = Math.round(
      config.weights.checklistMax * (completedChecklist / totalChecklist)
    );
    if (progressScore > 0) {
      score += progressScore;
      addReason(reasons, 'Prep progress', progressScore);
    }
  }

  if (followupCount > 0) {
    score += config.weights.followupPlan;
    addReason(reasons, 'Follow-up plan set', config.weights.followupPlan);
  }

  const hasOverdueChecklist = checklistItems.some(
    (item) => !item.isDone && item.dueAt && item.dueAt.getTime() < now.getTime()
  );
  if (hasOverdueChecklist) {
    score += config.weights.overduePenalty;
    addReason(reasons, 'Overdue prep items', config.weights.overduePenalty);
  }

  score = Math.max(0, Math.min(100, score));

  const band: WinProbabilityBand =
    score >= config.bandThresholds.hot
      ? 'hot'
      : score >= config.bandThresholds.warm
        ? 'warm'
        : 'cold';

  const sortedReasons = reasons
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .map((reason) => reason.label);

  return {
    score,
    band,
    reasons: sortedReasons.slice(0, 6),
  };
}
