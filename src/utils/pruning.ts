import type { PruneSchedulePoint } from "../types/index.js";

export function parsePruneSchedule(raw: string): PruneSchedulePoint[] {
  if (!raw.trim()) return [];
  const seenDepths = new Set<number>();
  return raw
    .split(",")
    .map((entry) => {
      const parts = entry.split(":");
      if (parts.length !== 2) {
        throw new Error(`Invalid prune schedule entry "${entry}". Expected depth:threshold.`);
      }

      const [depthRaw, thresholdRaw] = parts;
      const depthText = depthRaw.trim();
      const thresholdText = thresholdRaw.trim();
      if (!depthText || !thresholdText) {
        throw new Error(`Invalid prune schedule entry "${entry}". Expected depth:threshold.`);
      }

      const depth = Number(depthText);
      const threshold = Number(thresholdText);
      if (!Number.isInteger(depth) || depth < 0) {
        throw new Error(`Invalid prune schedule entry "${entry}". Expected depth:threshold.`);
      }
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        throw new Error(`Invalid prune schedule entry "${entry}": threshold must be between 0 and 1.`);
      }
      if (seenDepths.has(depth)) {
        throw new Error(`Duplicate prune schedule depth "${depth}". Each depth may appear only once.`);
      }
      seenDepths.add(depth);
      return { depth, threshold };
    })
    .sort((a, b) => a.depth - b.depth);
}

export function getPruneThresholdForDepth(
  depth: number,
  fallbackThreshold: number,
  schedule: PruneSchedulePoint[] | undefined
): number {
  if (!schedule || schedule.length === 0) return fallbackThreshold;
  let selected = fallbackThreshold;
  for (const point of schedule) {
    if (point.depth <= depth) selected = point.threshold;
  }
  return selected;
}
