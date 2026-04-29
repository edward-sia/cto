/**
 * Tree Orchestrator — the conductor of the whole symphony.
 * Manages tree construction, debate coordination, Codex execution,
 * judging, and state persistence.
 */

import OpenAI from "openai";
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
  TaskAnalysis,
} from "../types/index.js";
import { AGENT_DEFINITIONS } from "../agents/definitions.js";
import { TaskAnalyzer } from "../analyzer/task-analyzer.js";
import { IntentDecomposer } from "../analyzer/intent-decomposer.js";
import { DebateEngine, type DebateProgressEvent } from "../debate/engine.js";
import { CodexExecutor } from "../execution/codex-client.js";
import { Judge } from "../judge/judge.js";
import { FileStore } from "../persistence/file-store.js";
import { Synthesizer } from "../synthesis/synthesizer.js";

const DEFAULT_PHASE_DEPTHS: Record<TreePhase, [number, number]> = {
  requirements: [0, 1],
  architecture: [2, 3],
  implementation: [4, 5],
  validation: [6, 7],
};

const PHASE_AGENT_MAP: Record<TreePhase, AgentRole[]> = {
  requirements: ["product-manager", "business-analyst", "qa-engineer"],
  architecture: ["tech-lead", "business-analyst", "code-reviewer", "qa-engineer"],
  implementation: ["developer", "tech-lead", "code-reviewer"],
  validation: ["qa-engineer", "code-reviewer", "developer"],
};

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxDepth: 6,
  maxBranching: 3,
  maxDebateRounds: 3,
  reasoningModel: "gpt-4o",
  judgeModel: "gpt-4o",
  workingDirectory: process.cwd(),
  phaseDepths: DEFAULT_PHASE_DEPTHS,
  dryRun: false,
  leafConcurrency: 4,
  pruneThreshold: 0,
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
  onRunComplete?: (state: RunState) => void;
  onError?: (nodeId: string, error: Error) => void;
}

export class TreeOrchestrator {
  private openai: OpenAI;
  private config: RunConfig;
  private store: FileStore;
  private codex: CodexExecutor;
  private judge: Judge;
  private analyzer: TaskAnalyzer;
  private decomposer: IntentDecomposer;
  private synthesizer: Synthesizer;
  private callbacks: OrchestratorCallbacks;
  private runState!: RunState;

  constructor(
    openai: OpenAI,
    config: Partial<RunConfig> = {},
    callbacks: OrchestratorCallbacks = {}
  ) {
    this.openai = openai;
    this.config = { ...DEFAULT_RUN_CONFIG, ...config };
    this.store = new FileStore();
    this.codex = new CodexExecutor(this.config.workingDirectory, this.config.dryRun, {
      cloudEnv: this.config.cloudEnv,
      cloudAttempts: this.config.cloudAttempts,
    });
    this.judge = new Judge(openai, this.config.judgeModel, this.config.dryRun);
    this.analyzer = new TaskAnalyzer(openai, this.config.reasoningModel, this.config.dryRun);
    this.decomposer = new IntentDecomposer(openai, this.config.reasoningModel, this.config.dryRun);
    this.synthesizer = new Synthesizer(openai, this.config.reasoningModel, this.config.dryRun);
    this.callbacks = callbacks;
  }

  async run(intent: string): Promise<RunState> {
    const runId = `run-${nanoid(10)}`;
    const analysis = await this.analyzer.analyze(intent);
    this.callbacks.onAnalysisComplete?.(analysis);

    const decomposition = await this.decomposer.decompose(intent);

    const root = this.createNode(null, 0, {
      originalIntent: intent,
      intentDecomposition: decomposition,
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
      status: "running",
      runMode: analysis.runMode,
      selectedAgents: analysis.selectedAgents,
    };

    await this.store.save(this.runState);

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
      this.runState.leafNodeIds = this.collectLeafIds(root);
      if (this.runState.runMode === "implementation") {
        await this.executeLeaves(root);
        await this.judgeLeaves(root);
        this.runState.rankedResults = this.rankResults(root);
      } else {
        await this.synthesizeLeaves(root);
      }
      this.runState.status = "completed";
      this.runState.completedAt = new Date().toISOString();
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
    this.config = state.config;

    const pendingNodes = this.findPendingNodes(state.root);
    for (const node of pendingNodes) {
      await this.processNode(node);
    }

    this.runState.status = "completed";
    this.runState.completedAt = new Date().toISOString();
    await this.store.save(this.runState);
    return this.runState;
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
      openai: this.openai,
      reasoningModel: this.config.reasoningModel,
      maxDebateRounds: this.config.maxDebateRounds,
      maxBranching: this.config.maxBranching,
      dryRun: this.config.dryRun,
      onProgress: (event) => this.callbacks.onDebateProgress?.(node.id, event),
    });

    const transcript = await debateEngine.runDebate(phase, node.context, agents);
    node.debate = transcript;
    this.runState.totalTokensUsed += transcript.tokenUsage;

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
      const alternatives = threshold > 0
        ? allAlternatives.filter((a) => a.confidence >= threshold)
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
      return phaseMatches.length > 0 ? phaseMatches : selected;
    }
    return PHASE_AGENT_MAP[phase];
  }

  private getPhaseForDepth(depth: number): TreePhase {
    for (const [phase, [min, max]] of Object.entries(this.config.phaseDepths)) {
      if (depth >= min && depth <= max) return phase as TreePhase;
    }
    return "validation";
  }

  private isLeaf(node: TreeNode): boolean {
    return node.children.length === 0 && (node.depth >= this.config.maxDepth - 1 || node.status === "consensus");
  }

  private collectLeafIds(node: TreeNode): string[] {
    if (this.isLeaf(node)) return [node.id];
    return node.children.flatMap((c) => this.collectLeafIds(c));
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
    if (this.isLeaf(node)) return [node];
    return node.children.flatMap((c) => this.collectLeaves(c));
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
