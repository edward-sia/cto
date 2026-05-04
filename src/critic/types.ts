export const REVERSIBILITY_VALUES = ["one-way", "reversible-with-effort", "freely-reversible"] as const;
export type Reversibility = (typeof REVERSIBILITY_VALUES)[number];

export const BLAST_RADIUS_VALUES = ["low", "medium", "high"] as const;
export type BlastRadius = (typeof BLAST_RADIUS_VALUES)[number];

export const TIME_TO_SIGNAL_VALUES = ["fast", "medium", "slow"] as const;
export type TimeToSignal = (typeof TIME_TO_SIGNAL_VALUES)[number];

export interface AxisValue<T extends string> {
  value: T;
  note: string;
}

export interface CriticChoiceEvaluation {
  reversibility: AxisValue<Reversibility>;
  blastRadius: AxisValue<BlastRadius>;
  timeToSignal: AxisValue<TimeToSignal>;
  counterCase: string;
  falsifier: string;
}

export interface CoverageGap {
  dimension: string;
  reason: string;
}

export interface CriticCoverageAudit {
  coverageGaps: CoverageGap[];
  premortem: string;
  auditedAt: string;
  followUpRoundFired: boolean;
}

export interface CoverageDimension {
  id: string;
  label: string;
  description: string;
  source: "fixed-core" | "intent-derived";
}
