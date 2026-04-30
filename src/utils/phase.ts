import type { TreePhase } from "../types/index.js";

const PHASES: TreePhase[] = ["requirements", "architecture", "implementation", "validation"];

export function getPhaseForDepth(depth: number, maxDepth: number): TreePhase {
  const fraction = maxDepth > 0 ? depth / maxDepth : 0;
  return PHASES[Math.min(Math.floor(fraction * PHASES.length), PHASES.length - 1)];
}
