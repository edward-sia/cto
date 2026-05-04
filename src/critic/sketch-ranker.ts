import type {
  BlastRadius,
  LeafImplementationSketch,
  Reversibility,
  TimeToSignal,
} from "../types/index.js";

const REVERSIBILITY_WEIGHT: Record<Reversibility, number> = {
  "freely-reversible": 3,
  "reversible-with-effort": 2,
  "one-way": 0,
};

const BLAST_RADIUS_WEIGHT: Record<BlastRadius, number> = {
  low: 3,
  medium: 2,
  high: 0,
};

const TIME_TO_SIGNAL_WEIGHT: Record<TimeToSignal, number> = {
  fast: 3,
  medium: 2,
  slow: 1,
};

const COMPLEXITY_RANK: Record<LeafImplementationSketch["estimatedComplexity"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function sketchRankScore(sketch: LeafImplementationSketch): number {
  const c = sketch.criticEvaluation;
  return (
    REVERSIBILITY_WEIGHT[c.reversibility.value] +
    BLAST_RADIUS_WEIGHT[c.blastRadius.value] +
    TIME_TO_SIGNAL_WEIGHT[c.timeToSignal.value]
  );
}

export function rankSketches(
  sketches: LeafImplementationSketch[]
): LeafImplementationSketch[] {
  return [...sketches].sort((a, b) => {
    const primary = sketchRankScore(b) - sketchRankScore(a);
    if (primary !== 0) return primary;
    const complexity =
      COMPLEXITY_RANK[a.estimatedComplexity] - COMPLEXITY_RANK[b.estimatedComplexity];
    if (complexity !== 0) return complexity;
    return b.confidence - a.confidence;
  });
}
