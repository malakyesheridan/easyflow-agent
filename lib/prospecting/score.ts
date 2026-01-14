export type SellerIntentBand = 'hot' | 'warm' | 'cold';

export type SellerIntentScore = {
  score: number;
  band: SellerIntentBand;
  reasons: string[];
};

export type ContactForScoring = {
  role: string;
  temperature: string;
  sellerStage: string | null;
  lastTouchAt: Date | null;
  nextTouchAt: Date | null;
  tags: string[];
};

export type ScoringConfig = {
  weights: {
    overdueFollowUp: number;
    recency7: number;
    recency14: number;
    recency30: number;
    temperatureHot: number;
    temperatureWarm: number;
    roleSeller: number;
    roleBoth: number;
    stageBoosts: Record<string, number>;
    pastClient: number;
    touchCount90d: number;
    tagBoost: number;
  };
  highIntentTags: string[];
  pastClientTags: string[];
  maxTagBoosts: number;
  bandThresholds: {
    hot: number;
    warm: number;
  };
};

const DEFAULT_CONFIG: ScoringConfig = {
  weights: {
    overdueFollowUp: 25,
    recency7: 15,
    recency14: 10,
    recency30: 5,
    temperatureHot: 20,
    temperatureWarm: 10,
    roleSeller: 15,
    roleBoth: 10,
    stageBoosts: {
      'appraisal booked': 25,
      'appraisal pending': 15,
      prospecting: 5,
    },
    pastClient: 20,
    touchCount90d: 10,
    tagBoost: 8,
  },
  highIntentTags: [
    'potential seller',
    'high equity',
    'moving interstate',
    'downsizer',
    'divorce',
    'deceased estate',
  ],
  pastClientTags: ['past client', 'past clients'],
  maxTagBoosts: 3,
  bandThresholds: {
    hot: 80,
    warm: 50,
  },
};

type Reason = { label: string; weight: number };

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function addReason(reasons: Reason[], label: string, weight: number) {
  reasons.push({ label, weight });
}

export function scoreSellerIntent(
  contact: ContactForScoring,
  touchCount90d: number,
  now: Date,
  config: ScoringConfig = DEFAULT_CONFIG
): SellerIntentScore {
  const reasons: Reason[] = [];
  let score = 0;

  if (contact.nextTouchAt && contact.nextTouchAt.getTime() < now.getTime()) {
    score += config.weights.overdueFollowUp;
    addReason(reasons, 'Overdue follow-up', config.weights.overdueFollowUp);
  }

  if (contact.lastTouchAt) {
    const daysSince = (now.getTime() - contact.lastTouchAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) {
      score += config.weights.recency7;
      addReason(reasons, 'Recent engagement', config.weights.recency7);
    } else if (daysSince <= 14) {
      score += config.weights.recency14;
      addReason(reasons, 'Recent engagement', config.weights.recency14);
    } else if (daysSince <= 30) {
      score += config.weights.recency30;
      addReason(reasons, 'Recent engagement', config.weights.recency30);
    }
  }

  const temperature = normalize(contact.temperature || '');
  if (temperature === 'hot') {
    score += config.weights.temperatureHot;
    addReason(reasons, 'Hot contact', config.weights.temperatureHot);
  } else if (temperature === 'warm') {
    score += config.weights.temperatureWarm;
    addReason(reasons, 'Warm contact', config.weights.temperatureWarm);
  }

  const role = normalize(contact.role || '');
  if (role === 'seller') {
    score += config.weights.roleSeller;
    addReason(reasons, 'Seller contact', config.weights.roleSeller);
  } else if (role === 'both') {
    score += config.weights.roleBoth;
    addReason(reasons, 'Seller/buyer contact', config.weights.roleBoth);
  }

  const stage = contact.sellerStage ? normalize(contact.sellerStage) : '';
  const stageBoost = stage ? config.weights.stageBoosts[stage] : undefined;
  if (stageBoost) {
    score += stageBoost;
    addReason(reasons, `Stage: ${contact.sellerStage}`, stageBoost);
  }

  const tagSet = new Set(contact.tags.map((tag) => normalize(tag)));
  const highIntentMatches = contact.tags
    .filter((tag) => config.highIntentTags.includes(normalize(tag)))
    .slice(0, config.maxTagBoosts);
  highIntentMatches.forEach((tag) => {
    score += config.weights.tagBoost;
    addReason(reasons, `High-intent tag: ${tag}`, config.weights.tagBoost);
  });

  const hasPastClient = config.pastClientTags.some((tag) => tagSet.has(tag));
  if (hasPastClient) {
    score += config.weights.pastClient;
    addReason(reasons, 'Past client', config.weights.pastClient);
  }

  if (touchCount90d >= 3) {
    score += config.weights.touchCount90d;
    addReason(reasons, 'Consistent touches', config.weights.touchCount90d);
  }

  score = Math.max(0, Math.min(100, score));

  const band: SellerIntentBand =
    score >= config.bandThresholds.hot
      ? 'hot'
      : score >= config.bandThresholds.warm
        ? 'warm'
        : 'cold';

  const sortedReasons = reasons
    .sort((a, b) => b.weight - a.weight)
    .map((reason) => reason.label);

  return {
    score,
    band,
    reasons: sortedReasons.slice(0, 5),
  };
}
