/**
 * Pre-run cost estimation. Numbers are rough — they exist to catch the user
 * before a 100k-token run, not to be billing-accurate.
 */

import type { CodexUsage, LLMUsage, RunConfig, TreePhase } from "../types/index.js";

interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gpt-4.1": { inputPerMTok: 3, outputPerMTok: 12 },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
  "o3": { inputPerMTok: 2, outputPerMTok: 8 },
  "o3-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4 },
  "openrouter/free": { inputPerMTok: 0, outputPerMTok: 0 },
  "deepseek-v4-pro": { inputPerMTok: 0.435, outputPerMTok: 0.87 },
  "deepseek-v4-flash": { inputPerMTok: 0.14, outputPerMTok: 0.28 },
};

const DEFAULT_PRICE: ModelPrice = MODEL_PRICES["gpt-4o"];

const PHASE_AGENT_COUNTS: Record<TreePhase, number> = {
  requirements: 3,
  architecture: 4,
  implementation: 3,
  validation: 3,
};

const AVG_INPUT_TOKENS_PER_AGENT_CALL = 2_000;
const AVG_OUTPUT_TOKENS_PER_AGENT_CALL = 800;
const AVG_INPUT_TOKENS_PER_MODERATOR_CALL = 3_000;
const AVG_OUTPUT_TOKENS_PER_MODERATOR_CALL = 400;
const AVG_INPUT_TOKENS_PER_JUDGE_CALL = 5_000;
const AVG_OUTPUT_TOKENS_PER_JUDGE_CALL = 400;
const AVG_INPUT_TOKENS_PER_SKETCH_CALL = 2_000;
const AVG_OUTPUT_TOKENS_PER_SKETCH_CALL = 700;

export interface CostEstimate {
  worstCaseNodes: number;
  worstCaseLeaves: number;
  expectedNodes: number;
  expectedLeaves: number;
  expectedDebateInputTokens: number;
  expectedDebateOutputTokens: number;
  expectedJudgeInputTokens: number;
  expectedJudgeOutputTokens: number;
  expectedSketchInputTokens: number;
  expectedSketchOutputTokens: number;
  expectedExecutedLeaves: number;
  expectedTotalTokens: number;
  estimatedUsd: number;
  modelPrice: ModelPrice;
  pricedModelKnown: boolean;
}

function getPrice(model: string): { price: ModelPrice; known: boolean } {
  if (model.endsWith(":free")) {
    return { price: { inputPerMTok: 0, outputPerMTok: 0 }, known: true };
  }
  const exact = MODEL_PRICES[model];
  if (exact) return { price: exact, known: true };
  return { price: DEFAULT_PRICE, known: false };
}

/**
 * Worst case: every debate diverges; every node fans out to maxBranching
 * children for the full depth.
 * Expected case: assume half the nodes branch.
 */
export function estimateRunCost(config: RunConfig): CostEstimate {
  const { maxDepth, maxBranching, maxDebateRounds } = config;

  let worstCaseNodes = 0;
  for (let d = 0; d < maxDepth; d++) {
    worstCaseNodes += Math.pow(maxBranching, d);
  }
  const worstCaseLeaves = Math.pow(maxBranching, Math.max(0, maxDepth - 1));

  // Expected: branching factor ~ (1 + maxBranching) / 2
  const expectedFanout = (1 + maxBranching) / 2;
  let expectedNodes = 0;
  for (let d = 0; d < maxDepth; d++) {
    expectedNodes += Math.pow(expectedFanout, d);
  }
  const expectedLeaves = Math.pow(expectedFanout, Math.max(0, maxDepth - 1));

  const phasesByDepth: TreePhase[] = [];
  for (let d = 0; d < maxDepth; d++) {
    for (const [phase, [min, max]] of Object.entries(config.phaseDepths) as [TreePhase, [number, number]][]) {
      if (d >= min && d <= max) {
        phasesByDepth.push(phase);
        break;
      }
    }
    if (phasesByDepth.length === d) phasesByDepth.push("validation");
  }

  // Average agent count across the depths actually used in this run.
  const avgAgentsPerPhase =
    phasesByDepth.reduce((acc, p) => acc + PHASE_AGENT_COUNTS[p], 0) / Math.max(1, phasesByDepth.length);

  // Average rounds per debate ~ 60% of max (often we hit consensus or diverge early).
  const expectedRounds = Math.max(1, maxDebateRounds * 0.6);

  const expectedDebateInputTokens = Math.round(
    expectedNodes * expectedRounds * (avgAgentsPerPhase * AVG_INPUT_TOKENS_PER_AGENT_CALL + AVG_INPUT_TOKENS_PER_MODERATOR_CALL)
  );
  const expectedDebateOutputTokens = Math.round(
    expectedNodes * expectedRounds * (avgAgentsPerPhase * AVG_OUTPUT_TOKENS_PER_AGENT_CALL + AVG_OUTPUT_TOKENS_PER_MODERATOR_CALL)
  );

  const sketchExecutionTopN = config.sketchExecutionTopN ?? 2;
  const enableSketchRanking = config.enableSketchRanking ?? true;
  const expectedExecutedLeaves = enableSketchRanking
    ? Math.min(Math.round(expectedLeaves), Math.max(1, sketchExecutionTopN))
    : Math.round(expectedLeaves);
  const expectedSketchInputTokens = enableSketchRanking
    ? Math.round(expectedLeaves * AVG_INPUT_TOKENS_PER_SKETCH_CALL)
    : 0;
  const expectedSketchOutputTokens = enableSketchRanking
    ? Math.round(expectedLeaves * AVG_OUTPUT_TOKENS_PER_SKETCH_CALL)
    : 0;
  const expectedJudgeInputTokens = Math.round(expectedExecutedLeaves * AVG_INPUT_TOKENS_PER_JUDGE_CALL);
  const expectedJudgeOutputTokens = Math.round(expectedExecutedLeaves * AVG_OUTPUT_TOKENS_PER_JUDGE_CALL);
  const expectedTotalTokens =
    expectedDebateInputTokens + expectedDebateOutputTokens + expectedSketchInputTokens + expectedSketchOutputTokens + expectedJudgeInputTokens + expectedJudgeOutputTokens;

  const reasoning = getPrice(config.reasoningModel);
  const judge = getPrice(config.judgeModel);

  const debateUsd =
    (expectedDebateInputTokens * reasoning.price.inputPerMTok +
      expectedDebateOutputTokens * reasoning.price.outputPerMTok) /
    1_000_000;
  const sketchUsd =
    (expectedSketchInputTokens * reasoning.price.inputPerMTok +
      expectedSketchOutputTokens * reasoning.price.outputPerMTok) /
    1_000_000;
  const judgeUsd =
    (expectedJudgeInputTokens * judge.price.inputPerMTok +
      expectedJudgeOutputTokens * judge.price.outputPerMTok) /
    1_000_000;
  const estimatedUsd = debateUsd + sketchUsd + judgeUsd;

  return {
    worstCaseNodes,
    worstCaseLeaves,
    expectedNodes: Math.round(expectedNodes),
    expectedLeaves: Math.round(expectedLeaves),
    expectedDebateInputTokens,
    expectedDebateOutputTokens,
    expectedSketchInputTokens,
    expectedSketchOutputTokens,
    expectedJudgeInputTokens,
    expectedJudgeOutputTokens,
    expectedExecutedLeaves,
    expectedTotalTokens,
    estimatedUsd,
    modelPrice: reasoning.price,
    pricedModelKnown: reasoning.known && judge.known,
  };
}

/**
 * Compute USD cost for an LLMUsage record at a given model's published rates.
 * `inputTokens` from the OpenAI API includes cached tokens; we charge cached
 * tokens at 50% (OpenAI's published prompt-cache discount for gpt-4o family).
 * Pass priceModelKnown=false to communicate uncertainty to the caller.
 */
export function priceLLMUsage(
  usage: LLMUsage,
  model: string
): { usd: number; priced: ModelPrice; modelKnown: boolean } {
  const { price, known } = getPrice(model);
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const usd =
    (uncachedInput * price.inputPerMTok +
      usage.cachedInputTokens * price.inputPerMTok * 0.5 +
      usage.outputTokens * price.outputPerMTok) /
    1_000_000;
  return { usd, priced: price, modelKnown: known };
}

/**
 * Best-effort Codex cost. The Codex SDK doesn't tell us which model was used,
 * so we apply gpt-4o pricing as a rough upper-bound proxy. If the Codex client
 * is authenticated via a ChatGPT subscription rather than an API key, the
 * marginal cost is $0 — return both numbers and let the caller decide.
 */
export function priceCodexUsage(
  usage: CodexUsage
): { usdProxy: number; priced: ModelPrice } {
  const price = MODEL_PRICES["gpt-4o"];
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const usdProxy =
    (uncachedInput * price.inputPerMTok +
      usage.cachedInputTokens * price.inputPerMTok * 0.5 +
      (usage.outputTokens + usage.reasoningOutputTokens) * price.outputPerMTok) /
    1_000_000;
  return { usdProxy, priced: price };
}

export function formatCostEstimate(estimate: CostEstimate, config: RunConfig): string {
  const usd = estimate.estimatedUsd.toFixed(2);
  const known = estimate.pricedModelKnown ? "" : " (model price unknown — used gpt-4o pricing as upper bound)";
  return [
    `Tree size:    ~${estimate.expectedNodes} nodes (worst case: ${estimate.worstCaseNodes}), ~${estimate.expectedLeaves} leaves (worst case: ${estimate.worstCaseLeaves})`,
    `LLM tokens:   ~${estimate.expectedTotalTokens.toLocaleString()} total (${(estimate.expectedDebateInputTokens + estimate.expectedDebateOutputTokens).toLocaleString()} debate, ${(estimate.expectedSketchInputTokens + estimate.expectedSketchOutputTokens).toLocaleString()} sketch, ${(estimate.expectedJudgeInputTokens + estimate.expectedJudgeOutputTokens).toLocaleString()} judge)`,
    `LLM cost:     ~$${usd}${known}`,
    `Codex calls:  ~${estimate.expectedExecutedLeaves} ranked leaf executions (from ~${estimate.expectedLeaves} sketched leaves; cost depends on Codex plan${config.cloudEnv ? `, ×${config.cloudAttempts ?? 1} cloud attempts` : ""})`,
  ].join("\n");
}
