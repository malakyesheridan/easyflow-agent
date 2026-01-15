"use client";

import InfoTooltip from './InfoTooltip';

interface ScoreBreakdownTooltipProps {
  label: string;
  meaning: string;
  bullets: string[];
  reasons?: string[];
  bands?: string;
}

export default function ScoreBreakdownTooltip({
  label,
  meaning,
  bullets,
  reasons = [],
  bands,
}: ScoreBreakdownTooltipProps) {
  const topReasons = reasons.filter(Boolean).slice(0, 5);

  return (
    <InfoTooltip
      label={label}
      content={(
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-text-primary">What this means</p>
            <p className="mt-1 text-xs text-text-secondary">{meaning}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary">How it is calculated</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-text-secondary">
              {bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary">Top drivers</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-text-secondary">
              {topReasons.length === 0
                ? <li>No drivers captured yet.</li>
                : topReasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
          {bands && (
            <p className="text-xs text-text-tertiary">{bands}</p>
          )}
        </div>
      )}
    />
  );
}
