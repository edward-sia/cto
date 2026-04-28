import { estimateRunCost, formatCostEstimate } from "../src/utils/cost.js";
import { DEFAULT_RUN_CONFIG } from "../src/orchestrator/orchestrator.js";

const cases = [
  { name: "small (depth=2 branching=2 4o-mini)", cfg: { ...DEFAULT_RUN_CONFIG, maxDepth: 2, maxBranching: 2, maxDebateRounds: 2, reasoningModel: "gpt-4o-mini", judgeModel: "gpt-4o-mini" } },
  { name: "medium (depth=2 branching=2 4o)", cfg: { ...DEFAULT_RUN_CONFIG, maxDepth: 2, maxBranching: 2, maxDebateRounds: 2, reasoningModel: "gpt-4o", judgeModel: "gpt-4o" } },
  { name: "big (depth=4 branching=3 4o)", cfg: { ...DEFAULT_RUN_CONFIG, maxDepth: 4, maxBranching: 3, maxDebateRounds: 3, reasoningModel: "gpt-4o", judgeModel: "gpt-4o" } },
  { name: "unknown model (gpt-5)", cfg: { ...DEFAULT_RUN_CONFIG, maxDepth: 2, maxBranching: 2, maxDebateRounds: 2, reasoningModel: "gpt-5", judgeModel: "gpt-5" } },
];

for (const { name, cfg } of cases) {
  console.log(`\n=== ${name} ===`);
  console.log(formatCostEstimate(estimateRunCost(cfg), cfg));
}
