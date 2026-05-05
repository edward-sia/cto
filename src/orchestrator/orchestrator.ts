/**
 * Tree Orchestrator — the conductor of the whole symphony.
 * Manages tree construction, debate coordination, Codex execution,
 * judging, and state persistence.
 */

import { nanoid } from "nanoid";
import type {
  TreeNode,
  NodeContext,
  TreePhase,
  RunConfig,
  RunState,
  AgentRole,
  Alternative,
  JudgeScore,
  CodexUsage,
  LLMUsage,
  TaskAnalysis,
  DomainFacts,
  HumanPlanDecision,
} from "../types/index.js";
import { PHASE_AGENTS } from "../types/index.js";
import { addUsage, emptyUsage } from "../utils/usage.js";
import { getPhaseForDepth } from "../utils/phase.js";
import { AGENT_DEFINITIONS } from "../agents/definitions.js";
import { TaskAnalyzer } from "../analyzer/task-analyzer.js";
import { IntentDecomposer } from "../analyzer/intent-decomposer.js";
import { DebateEngine, type DebateProgressEvent } from "../debate/engine.js";
import { CodexExecutor } from "../execution/codex-client.js";
import { Judge } from "../judge/judge.js";
import { FileStore } from "../persistence/file-store.js";
import { Synthesizer } from "../synthesis/synthesizer.js";
import type { LLMClient } from "../providers/llm-provider.js";

const DEFAULT_PHASE_DEPTHS: Record<TreePhase, [number, number]> = {
  requirements: [0, 1],
  architecture: [2, 3],
  implementation: [4, 5],
  validation: [6, 7],
};

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxDepth: 6,
  maxBranching: 3,
  maxDebateRounds: 3,
  llmProvider: "openai",
  llmApiKeyEnv: "OPENAI_API_KEY",
  reasoningModel: "gpt-4o",
  judgeModel: "gpt-4o",
  workingDirectory: process.cwd(),
  phaseDepths: DEFAULT_PHASE_DEPTHS,
  dryRun: false,
  interactivePlan: false,
  leafConcurrency: 4,
  pruneThreshold: 0.5,
};

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= tasks.length) return;
      results[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return results;
}

export interface OrchestratorCallbacks {
  onAnalysisComplete?: (analysis: TaskAnalysis) => void;
  onDebateProgress?: (nodeId: string, event: DebateProgressEvent) => void;
  onNodeCreated?: (node: TreeNode) => void;
  onBranching?: (parentId: string, alternatives: Alternative[]) => void;
  onPruned?: (parentId: string, prunedCount: number, threshold: number) => void;
  onLeafExecuting?: (nodeId: string) => void;
  onLeafScored?: (nodeId: string, score: JudgeScore) => void;
  onRunStarted?: (state: RunState) => void | Promise<void>;
  onHumanPlanReview?: (node: TreeNode, state: RunState) => Promise<HumanPlanDecision>;
  onHumanPlanApplied?: (nodeId: string, decision: HumanPlanDecision) => void;
  onRunComplete?: (state: RunState) => void;
  onError?: (nodeId: string, error: Error) => void;
}

export class TreeOrchestrator {
  private llm: LLMClient;
  private config: RunConfig;
  private store: FileStore;
  private codex: CodexExecutor;
  private judge: Judge;
  private analyzer: TaskAnalyzer;
  private decomposer: IntentDecomposer;
  private synthesizer: Synthesizer;
  private callbacks: OrchestratorCallbacks;
  private runState!: RunState;
  private configOverrides: Partial<RunConfig>;

  constructor(
    llm: LLMClient,
    config: Partial<RunConfig> = {},
    callbacks: OrchestratorCallbacks = {}
  ) {
    this.llm = llm;
    this.configOverrides = config;
    this.config = { ...DEFAULT_RUN_CONFIG, ...config };
    this.store = new FileStore();
    this.codex = new CodexExecutor(this.config.workingDirectory, this.config.dryRun, {
      cloudEnv: this.config.cloudEnv,
      cloudAttempts: this.config.cloudAttempts,
    });
    this.judge = new Judge(this.llm, this.config.judgeModel, this.config.dryRun);
    this.analyzer = new TaskAnalyzer(this.llm, this.config.reasoningModel, this.config.dryRun);
    this.decomposer = new IntentDecomposer(this.llm, this.config.reasoningModel, this.config.dryRun);
    this.synthesizer = new Synthesizer(this.llm, this.config.reasoningModel, this.config.dryRun);
    this.callbacks = callbacks;
  }

  async run(intent: string, domainFacts?: DomainFacts): Promise<RunState> {
    const runId = `run-${nanoid(10)}`;
    const analysis = await this.analyzer.analyze(intent);
    this.callbacks.onAnalysisComplete?.(analysis);

    const decomposition = await this.decomposer.decompose(intent);

    const root = this.createNode(null, 0, {
      originalIntent: intent,
      intentDecomposition: decomposition,
      domainFacts,
      ancestorSummaries: [],
    });

    this.runState = {
      id: runId,
      config: this.config,
      intent,
      root,
      leafNodeIds: [],
      startedAt: new Date().toISOString(),
      totalTokensUsed: 0,
      llmUsage: emptyUsage(),
      status: "running",
      runMode: analysis.runMode,
      selectedAgents: analysis.selectedAgents,
    };
    this.accumulateLLMUsage(this.analyzer.llmUsage);
    this.accumulateLLMUsage(this.decomposer.llmUsage);

    await this.store.save(this.runState);
    await this.callbacks.onRunStarted?.(this.runState);

    let shuttingDown = false;
    const handleSigint = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.error("\n\nInterrupt received — saving state...");
      this.runState.status = "paused";
      await this.store.save(this.runState).catch(() => {});
      console.error(`Run paused. Resume with: cto resume ${this.runState.id}`);
      process.exit(130);
    };
    process.on("SIGINT", handleSigint);

    try {
      await this.processNode(root);
      await this.completeAfterTree(root);
      if (this.runState.status === "running") {
        this.runState.status = "completed";
        this.runState.completedAt = new Date().toISOString();
      }
    } catch (error) {
      this.runState.status = "failed";
      throw error;
    } finally {
      process.removeListener("SIGINT", handleSigint);
      await this.store.save(this.runState);
    }

    this.callbacks.onRunComplete?.(this.runState);
    return this.runState;
  }

  async resume(runId: string): Promise<RunState> {
    const state = await this.store.load(runId);
    if (!state) throw new Error(`Run ${runId} not found`);
    this.runState = state;
    this.config = { ...DEFAULT_RUN_CONFIG, ...state.config, ...this.configOverrides };
    this.runState.config = this.config;

    const pendingNodes = this.findPendingNodes(state.root);
    for (const node of pendingNodes) {
      await this.processNode(node);
    }

    this.runState.status = "running";
    await this.completeAfterTree(state.root);
    if (this.runState.status === "running") {
      this.runState.status = "completed";
      this.runState.completedAt = new Date().toISOString();
    }
    await this.store.save(this.runState);
    return this.runState;
  }

  private async completeAfterTree(root: TreeNode): Promise<void> {
    this.runState.leafNodeIds = this.collectLeafIds(root);
    if (this.config.interactivePlan) {
      await this.runInteractivePlanGate(root);
      this.runState.leafNodeIds = this.collectLeafIds(root);
    }

    if (this.runState.leafNodeIds.length === 0) {
      this.runState.status = "paused";
      await this.store.save(this.runState);
      return;
    }

    if (this.runState.runMode === "implementation") {
      await this.executeLeaves(root);
      await this.judgeLeaves(root);
      this.accumulateLLMUsage(this.judge.llmUsage);
      this.runState.rankedResults = this.rankResults(root);
    } else {
      await this.synthesizeLeaves(root);
      this.accumulateLLMUsage(this.synthesizer.llmUsage);
    }
  }

  private async runInteractivePlanGate(root: TreeNode): Promise<void> {
    if (!this.callbacks.onHumanPlanReview) {
      throw new Error("Interactive plan mode requires an onHumanPlanReview callback.");
    }

    const reviewLeaves = this.collectLeaves(root).filter((node) =>
      !node.humanIntervention && !this.isHumanRevisionDescendant(root, node)
    );

    for (const leaf of reviewLeaves) {
      if (leaf.status === "pruned" || leaf.humanIntervention) continue;
      this.runState.pendingHumanReview = {
        requestId: `review-${nanoid(10)}`,
        nodeId: leaf.id,
        createdAt: new Date().toISOString(),
      };
      await this.store.save(this.runState);
      const decision = await this.callbacks.onHumanPlanReview(leaf, this.runState);
      delete this.runState.pendingHumanReview;
      await this.store.save(this.runState);
      await this.applyHumanPlanDecision(leaf, decision);
      this.callbacks.onHumanPlanApplied?.(leaf.id, decision);
      this.runState.leafNodeIds = this.collectLeafIds(root);
      await this.store.save(this.runState);
    }
  }

  private async applyHumanPlanDecision(node: TreeNode, decision: HumanPlanDecision): Promise<void> {
    const createdAt = new Date().toISOString();
    node.humanIntervention = { ...decision, createdAt };
    node.updatedAt = createdAt;

    if (decision.action === "kill") {
      node.status = "pruned";
      return;
    }

    if (decision.action === "proceed") return;

    const prompt = decision.prompt.trim();
    const childContext: NodeContext = {
      ...node.context,
      humanRevisionPrompt: prompt,
      ancestorSummaries: [
        ...node.context.ancestorSummaries,
        `Human revision before implementation: ${prompt}`,
      ],
    };
    const child = this.createNode(node.id, node.depth + 1, childContext);
    child.branchLabel = "human-revision";
    child.branchDescription = prompt;
    node.children.push(child);
    this.callbacks.onNodeCreated?.(child);
    await this.processNode(child);
  }

  private async processNode(node: TreeNode): Promise<void> {
    if (node.depth >= this.config.maxDepth) {
      node.status = "completed";
      return;
    }

    const phase = this.getPhaseForDepth(node.depth);
    node.phase = phase;
    node.status = "debating";

    const agents = this.getAgentsForPhase(phase);

    const debateEngine = new DebateEngine({
      llm: this.llm,
      reasoningModel: this.config.reasoningModel,
      maxDebateRounds: this.config.maxDebateRounds,
      maxBranching: this.config.maxBranching,
      dryRun: this.config.dryRun,
      onProgress: (event) => this.callbacks.onDebateProgress?.(node.id, event),
    });

    const transcript = await debateEngine.runDebate(phase, node.context, agents);
    node.debate = transcript;
    this.runState.totalTokensUsed += transcript.tokenUsage;
    this.accumulateLLMUsage(transcript.llmUsage);

    const budget = this.config.tokenBudget;
    if (budget && this.runState.totalTokensUsed > budget) {
      console.warn(
        `\n⚠️  Token budget exceeded: ${this.runState.totalTokensUsed.toLocaleString()} / ${budget.toLocaleString()} tokens used`
      );
    }

    if (transcript.finalOutcome === "branched") {
      const lastRound = transcript.rounds[transcript.rounds.length - 1];
      const allAlternatives = lastRound.alternatives;
      const threshold = this.config.pruneThreshold;
      const effectiveScore = (a: { confidence: number; relevanceToIntent: number }) =>
        a.confidence * a.relevanceToIntent;
      const alternatives = threshold > 0
        ? allAlternatives.filter((a) => effectiveScore(a) >= threshold)
        : allAlternatives;
      const pruned = allAlternatives.length - alternatives.length;
      if (pruned > 0) {
        this.callbacks.onPruned?.(node.id, pruned, threshold);
      }

      if (alternatives.length === 0) {
        node.status = "consensus";
        await this.processConsensusChild(node, transcript.summary);
        return;
      }

      if (alternatives.length === 1) {
        node.status = "consensus";
        await this.processConsensusChild(node, transcript.summary, transcript.contextUpdates);
        return;
      }

      node.status = "branched";
      this.callbacks.onBranching?.(node.id, alternatives);

      for (const alt of alternatives) {
        const childContext: NodeContext = {
          ...node.context,
          ...transcript.contextUpdates,
          acceptanceCriteria: [...new Set([
            ...(node.context.acceptanceCriteria ?? []),
            ...(transcript.contextUpdates.acceptanceCriteria ?? []),
          ])],
          architectureDecisions: [...new Set([
            ...(node.context.architectureDecisions ?? []),
            ...(transcript.contextUpdates.architectureDecisions ?? []),
            `Chosen branch: ${alt.label} — ${alt.description}`,
          ])],
          branchDecision: `${alt.label}: ${alt.description}`,
          ancestorSummaries: [...node.context.ancestorSummaries, transcript.summary],
        };
        const child = this.createNode(node.id, node.depth + 1, childContext);
        child.branchLabel = alt.label;
        child.branchDescription = alt.description;
        node.children.push(child);
        this.callbacks.onNodeCreated?.(child);
      }

      for (const child of node.children) {
        await this.processNode(child);
      }
    } else {
      node.status = "consensus";
      await this.processConsensusChild(node, transcript.summary, transcript.contextUpdates);
    }

    await this.store.save(this.runState);
  }

  private async processConsensusChild(
    node: TreeNode,
    summary: string,
    contextUpdates: Partial<NodeContext> = {}
  ): Promise<void> {
    if (node.depth + 1 >= this.config.maxDepth) return;

    const childContext: NodeContext = {
      ...node.context,
      ...contextUpdates,
      acceptanceCriteria: [...new Set([
        ...(node.context.acceptanceCriteria ?? []),
        ...(contextUpdates.acceptanceCriteria ?? []),
      ])],
      architectureDecisions: [...new Set([
        ...(node.context.architectureDecisions ?? []),
        ...(contextUpdates.architectureDecisions ?? []),
      ])],
      ancestorSummaries: [...node.context.ancestorSummaries, summary],
    };

    const child = this.createNode(node.id, node.depth + 1, childContext);
    child.branchLabel = "consensus";
    child.branchDescription = summary;
    node.children.push(child);
    this.callbacks.onNodeCreated?.(child);
    await this.processNode(child);
  }

  private async executeLeaves(root: TreeNode): Promise<void> {
    const leaves = this.collectLeaves(root).filter((n) => n.status !== "pruned");
    const tasks = leaves.map((leaf) => async () => {
      this.callbacks.onLeafExecuting?.(leaf.id);
      leaf.status = "executing";
      try {
        leaf.executionResult = await this.codex.execute(leaf);
        leaf.status = "completed";
        if (leaf.executionResult.usage) this.addToCodexTotal(leaf.executionResult.usage);
      } catch (error) {
        leaf.status = "completed";
        leaf.executionResult = {
          threadId: "error",
          success: false,
          filesChanged: [],
          output: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
        this.callbacks.onError?.(leaf.id, error instanceof Error ? error : new Error(String(error)));
      }
      await this.store.save(this.runState);
    });
    await runWithConcurrency(tasks, this.config.leafConcurrency);
  }

  private async judgeLeaves(root: TreeNode): Promise<void> {
    const leaves = this.collectLeaves(root).filter((n) => n.executionResult && n.status !== "pruned");
    const tasks = leaves.map((leaf) => async () => {
      const score = await this.judge.score(leaf);
      leaf.score = score;
      leaf.status = "scored";
      this.callbacks.onLeafScored?.(leaf.id, score);
    });
    await runWithConcurrency(tasks, this.config.leafConcurrency);
  }

  private async synthesizeLeaves(root: TreeNode): Promise<void> {
    const leaves = this.collectLeaves(root).filter((n) => n.status !== "pruned");
    const tasks = leaves.map((leaf) => async () => {
      this.callbacks.onLeafExecuting?.(leaf.id);
      leaf.status = "executing";
      try {
        leaf.executionResult = await this.synthesizer.synthesize(leaf);
        leaf.status = "completed";
      } catch (error) {
        leaf.status = "completed";
        leaf.executionResult = {
          threadId: "error",
          success: false,
          filesChanged: [],
          output: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
        this.callbacks.onError?.(leaf.id, error instanceof Error ? error : new Error(String(error)));
      }
      await this.store.save(this.runState);
    });
    await runWithConcurrency(tasks, this.config.leafConcurrency);
  }

  private accumulateLLMUsage(usage: LLMUsage): void {
    if (!this.runState.llmUsage) this.runState.llmUsage = emptyUsage();
    addUsage(this.runState.llmUsage, usage);
  }

  private addToCodexTotal(usage: CodexUsage): void {
    if (!this.runState.codexUsageTotal) {
      this.runState.codexUsageTotal = {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
      };
    }
    this.runState.codexUsageTotal.inputTokens += usage.inputTokens;
    this.runState.codexUsageTotal.cachedInputTokens += usage.cachedInputTokens;
    this.runState.codexUsageTotal.outputTokens += usage.outputTokens;
    this.runState.codexUsageTotal.reasoningOutputTokens += usage.reasoningOutputTokens;
  }

  private createNode(parentId: string | null, depth: number, context: NodeContext): TreeNode {
    return {
      id: `node-${nanoid(10)}`,
      parentId,
      depth,
      phase: this.getPhaseForDepth(depth),
      status: "pending",
      context,
      children: [],
      branchLabel: "",
      branchDescription: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private getAgentsForPhase(phase: TreePhase): AgentRole[] {
    const selected = this.runState.selectedAgents;
    if (selected && selected.length > 0) {
      const phaseMatches = selected.filter((role) =>
        AGENT_DEFINITIONS[role].primaryPhases.includes(phase)
      );
      return phaseMatches.length > 0 ? phaseMatches : PHASE_AGENTS[phase];
    }
    return PHASE_AGENTS[phase];
  }

  private getPhaseForDepth(depth: number): TreePhase {
    return getPhaseForDepth(depth, this.config.maxDepth);
  }

  private isLeaf(node: TreeNode): boolean {
    return node.children.length === 0 && (node.depth >= this.config.maxDepth - 1 || node.status === "consensus");
  }

  private collectLeafIds(node: TreeNode): string[] {
    return this.collectLeaves(node).map((leaf) => leaf.id);
  }

  private findPendingNodes(node: TreeNode): TreeNode[] {
    if (node.status === "pending") return [node];
    return node.children.flatMap((c) => this.findPendingNodes(c));
  }

  private rankResults(root: TreeNode): RunState["rankedResults"] {
    const leaves = this.collectLeaves(root).filter((n) => n.score);
    return leaves
      .map((leaf) => ({
        nodeId: leaf.id,
        path: this.getPathLabels(root, leaf.id),
        score: leaf.score!,
      }))
      .sort((a, b) => b.score.composite - a.score.composite);
  }

  private collectLeaves(node: TreeNode): TreeNode[] {
    if (node.status === "pruned") return [];
    if (this.isLeaf(node)) return [node];
    return node.children.flatMap((c) => this.collectLeaves(c));
  }

  private isHumanRevisionDescendant(root: TreeNode, node: TreeNode): boolean {
    let currentParentId = node.parentId;
    while (currentParentId) {
      const parent = this.findNode(root, currentParentId);
      if (!parent) return false;
      if (parent.humanIntervention?.action === "revise" || parent.branchLabel === "human-revision") {
        return true;
      }
      currentParentId = parent.parentId;
    }
    return false;
  }

  private findNode(root: TreeNode, targetId: string): TreeNode | undefined {
    if (root.id === targetId) return root;
    for (const child of root.children) {
      const found = this.findNode(child, targetId);
      if (found) return found;
    }
    return undefined;
  }

  private getPathLabels(root: TreeNode, targetId: string): string[] {
    const path: string[] = [];
    const find = (node: TreeNode): boolean => {
      if (node.id === targetId) {
        if (node.branchLabel) path.push(node.branchLabel);
        return true;
      }
      for (const child of node.children) {
        if (find(child)) {
          if (node.branchLabel) path.unshift(node.branchLabel);
          return true;
        }
      }
      return false;
    };
    find(root);
    return path;
  }
}
