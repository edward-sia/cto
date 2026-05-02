/**
 * Tree Orchestrator — the conductor of the whole symphony.
 * Manages tree construction, debate coordination, Codex execution,
 * judging, and state persistence.
 */

import OpenAI from "openai";
import { nanoid } from "nanoid";
import { join } from "node:path";
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
  CacheStats,
} from "../types/index.js";
import { PHASE_AGENTS } from "../types/index.js";
import { addUsage, emptyUsage } from "../utils/usage.js";
import { getPhaseForDepth } from "../utils/phase.js";
import { getPruneThresholdForDepth } from "../utils/pruning.js";
import { DEFAULT_MODEL_ASSIGNMENTS, defaultModelTiers, modelForStage, normalizeModelAssignments, normalizeModelTiers } from "../utils/model-routing.js";
import { AGENT_DEFINITIONS } from "../agents/definitions.js";
import { TaskAnalyzer } from "../analyzer/task-analyzer.js";
import { IntentDecomposer } from "../analyzer/intent-decomposer.js";
import { IntentDossierBuilder } from "../analyzer/intent-dossier.js";
import { DebateEngine, type DebateProgressEvent } from "../debate/engine.js";
import { CodexExecutor } from "../execution/codex-client.js";
import { LeafSketcher } from "../execution/sketcher.js";
import { computeFitnessScore } from "../judge/fitness.js";
import { Judge } from "../judge/judge.js";
import {
  CACHE_PROMPT_VERSION,
  DeterministicCache,
  artifactHash,
  buildCacheKey,
  normalizeIntentInput,
  repoFingerprint,
} from "../persistence/deterministic-cache.js";
import { FileStore } from "../persistence/file-store.js";
import { Synthesizer } from "../synthesis/synthesizer.js";
import { defaultToolAdapters } from "../tools/adapters.js";
import { ToolBroker } from "../tools/broker.js";
import { VerificationRunner } from "../verification/runner.js";

const DEFAULT_PHASE_DEPTHS: Record<TreePhase, [number, number]> = {
  requirements: [0, 1],
  architecture: [2, 3],
  implementation: [4, 5],
  validation: [6, 7],
};

export const DEFAULT_TOOL_USE_CONFIG: NonNullable<RunConfig["toolUse"]> = {
  enabled: false,
  allowlist: [],
  maxRequestsPerNode: 6,
  maxRequestsPerRound: 4,
  maxRequestsPerRun: 30,
  maxEvidenceItemsInPrompt: 8,
  autoRunReadOnly: true,
};

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxDepth: 6,
  maxBranching: 3,
  maxDebateRounds: 3,
  llmProvider: "openai",
  llmApiKeyEnv: "OPENAI_API_KEY",
  reasoningModel: "gpt-4o",
  judgeModel: "gpt-4o",
  modelTiers: defaultModelTiers("gpt-4o"),
  modelAssignments: DEFAULT_MODEL_ASSIGNMENTS,
  workingDirectory: process.cwd(),
  phaseDepths: DEFAULT_PHASE_DEPTHS,
  dryRun: false,
  interactivePlan: false,
  toolUse: DEFAULT_TOOL_USE_CONFIG,
  enableDeterministicCache: true,
  enableSketchRanking: true,
  sketchExecutionTopN: 2,
  leafConcurrency: 4,
  pruneThreshold: 0.5,
  verificationCommands: [],
  verificationTimeoutMs: 300_000,
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
  private openai: OpenAI;
  private config: RunConfig;
  private store: FileStore;
  private codex: CodexExecutor;
  private judge: Judge;
  private analyzer: TaskAnalyzer;
  private decomposer: IntentDecomposer;
  private dossierBuilder: IntentDossierBuilder;
  private synthesizer: Synthesizer;
  private sketcher: LeafSketcher;
  private cache: DeterministicCache;
  private repoFingerprint: string;
  private toolBroker?: ToolBroker;
  private callbacks: OrchestratorCallbacks;
  private runState!: RunState;
  private configOverrides: Partial<RunConfig>;

  constructor(
    openai: OpenAI,
    config: Partial<RunConfig> = {},
    callbacks: OrchestratorCallbacks = {}
  ) {
    this.openai = openai;
    this.configOverrides = config;
    this.config = this.normalizeConfig(config);
    this.store = new FileStore();
    this.cache = new DeterministicCache({
      cwd: this.config.workingDirectory,
      enabled: this.config.enableDeterministicCache && !this.config.dryRun,
    });
    this.repoFingerprint = repoFingerprint(this.config.workingDirectory);
    this.toolBroker = this.makeToolBroker();
    this.codex = new CodexExecutor(this.config.workingDirectory, this.config.dryRun, {
      cloudEnv: this.config.cloudEnv,
      cloudAttempts: this.config.cloudAttempts,
    });
    this.judge = new Judge(openai, modelForStage(this.config, "judge"), this.config.dryRun);
    this.analyzer = new TaskAnalyzer(openai, modelForStage(this.config, "analyzer"), this.config.dryRun);
    this.decomposer = new IntentDecomposer(openai, modelForStage(this.config, "decomposer"), this.config.dryRun);
    this.dossierBuilder = new IntentDossierBuilder(openai, modelForStage(this.config, "dossier"), this.config.dryRun);
    this.synthesizer = new Synthesizer(openai, modelForStage(this.config, "synthesis"), this.config.dryRun);
    this.sketcher = new LeafSketcher(
      openai,
      modelForStage(this.config, "sketch"),
      modelForStage(this.config, "sketchJudge"),
      this.config.dryRun
    );
    this.callbacks = callbacks;
  }

  private normalizeConfig(config: Partial<RunConfig>): RunConfig {
    const merged = { ...DEFAULT_RUN_CONFIG, ...config };
    return {
      ...merged,
      toolUse: {
        ...DEFAULT_TOOL_USE_CONFIG,
        ...config.toolUse,
      },
      modelTiers: normalizeModelTiers(
        merged.reasoningModel,
        config.modelTiers
      ),
      modelAssignments: normalizeModelAssignments(
        config.modelAssignments
      ),
    };
  }

  private makeToolBroker(): ToolBroker | undefined {
    return this.config.toolUse?.enabled
      ? new ToolBroker({
        config: this.config.toolUse,
        adapters: defaultToolAdapters(this.config.workingDirectory),
      })
      : undefined;
  }

  private async cached<T>(
    kind: string,
    model: string,
    input: unknown,
    compute: () => Promise<T>
  ): Promise<T> {
    const key = buildCacheKey({
      kind,
      provider: this.config.llmProvider,
      model,
      promptVersion: CACHE_PROMPT_VERSION,
      input,
      repoFingerprint: this.repoFingerprint,
    });
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined) {
      this.syncCacheStats();
      return cached;
    }
    const value = await compute();
    await this.cache.set({
      key,
      kind,
      value,
      createdAt: new Date().toISOString(),
      model,
      promptVersion: CACHE_PROMPT_VERSION,
      repoFingerprint: this.repoFingerprint,
    });
    this.syncCacheStats();
    return value;
  }

  private async cachedArtifact<T>(
    kind: string,
    artifact: string,
    input: unknown,
    compute: () => Promise<T>,
    model?: string
  ): Promise<T> {
    const hash = artifactHash(artifact);
    const key = buildCacheKey({
      kind,
      provider: this.config.llmProvider,
      model,
      promptVersion: CACHE_PROMPT_VERSION,
      input,
      artifactHash: hash,
    });
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined) {
      this.syncCacheStats();
      return cached;
    }
    const value = await compute();
    await this.cache.set({
      key,
      kind,
      value,
      createdAt: new Date().toISOString(),
      model,
      promptVersion: CACHE_PROMPT_VERSION,
      artifactHash: hash,
    });
    this.syncCacheStats();
    return value;
  }

  private cacheStats(): CacheStats {
    return { ...this.cache.stats };
  }

  private syncCacheStats(): void {
    if (this.runState) this.runState.cacheStats = this.cacheStats();
  }

  async run(intent: string, domainFacts?: DomainFacts): Promise<RunState> {
    const runId = `run-${nanoid(10)}`;
    const normalizedIntent = normalizeIntentInput(intent);
    const analysis = await this.cached(
      "specialist-selection",
      modelForStage(this.config, "analyzer"),
      { intent: normalizedIntent },
      () => this.analyzer.analyze(intent)
    );
    this.callbacks.onAnalysisComplete?.(analysis);

    const decomposition = await this.cached(
      "intent-decomposition",
      modelForStage(this.config, "decomposer"),
      { intent: normalizedIntent },
      () => this.decomposer.decompose(intent)
    );
    const dossier = await this.cached(
      "intent-dossier",
      modelForStage(this.config, "dossier"),
      { intent: normalizedIntent, decomposition },
      () => this.dossierBuilder.build(intent, decomposition)
    );

    const root = this.createNode(null, 0, {
      originalIntent: intent,
      intentDecomposition: decomposition,
      intentDossier: dossier,
      domainFacts,
      repositoryContext: {
        workingDirectory: this.config.workingDirectory,
      },
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
      cacheStats: this.cacheStats(),
      status: "running",
      runMode: analysis.runMode,
      selectedAgents: analysis.selectedAgents,
    };
    this.accumulateLLMUsage(this.analyzer.llmUsage);
    this.accumulateLLMUsage(this.decomposer.llmUsage);
    this.accumulateLLMUsage(this.dossierBuilder.llmUsage);

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
    this.config = this.normalizeConfig({ ...state.config, ...this.configOverrides });
    this.runState.config = this.config;
    this.cache = new DeterministicCache({
      cwd: this.config.workingDirectory,
      enabled: this.config.enableDeterministicCache && !this.config.dryRun,
    });
    this.repoFingerprint = repoFingerprint(this.config.workingDirectory);
    this.toolBroker = this.makeToolBroker();
    this.codex = new CodexExecutor(this.config.workingDirectory, this.config.dryRun, {
      cloudEnv: this.config.cloudEnv,
      cloudAttempts: this.config.cloudAttempts,
    });
    this.judge = new Judge(this.openai, modelForStage(this.config, "judge"), this.config.dryRun);
    this.synthesizer = new Synthesizer(this.openai, modelForStage(this.config, "synthesis"), this.config.dryRun);
    this.sketcher = new LeafSketcher(
      this.openai,
      modelForStage(this.config, "sketch"),
      modelForStage(this.config, "sketchJudge"),
      this.config.dryRun
    );
    this.syncCacheStats();

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
      const leavesToExecute = this.config.enableSketchRanking
        ? await this.sketchAndSelectLeaves(root)
        : this.collectLeaves(root).filter((n) => n.status !== "pruned");
      await this.executeLeaves(root, leavesToExecute);
      const fallback = this.nextSketchFallback(root, leavesToExecute);
      if (fallback) {
        fallback.skippedExecutionReason = undefined;
        await this.executeLeaves(root, [fallback]);
      }
      this.accumulateLLMUsage(this.sketcher.llmUsage);
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
      openai: this.openai,
      reasoningModel: modelForStage(this.config, "debate"),
      moderatorModel: modelForStage(this.config, "moderator"),
      maxDebateRounds: this.config.maxDebateRounds,
      maxBranching: this.config.maxBranching,
      dryRun: this.config.dryRun,
      onProgress: (event) => this.callbacks.onDebateProgress?.(node.id, event),
      nodeId: node.id,
      toolBroker: this.toolBroker,
      initialRunToolRequestCount: this.countBudgetedToolRequests(this.runState.root),
      toolEvidencePromptLimit: this.config.toolUse?.maxEvidenceItemsInPrompt,
      enabledTools: this.config.toolUse?.enabled ? this.config.toolUse.allowlist : [],
    });

    const transcript = await debateEngine.runDebate(phase, node.context, agents);
    node.debate = transcript;
    if (transcript.toolRequests?.length) {
      node.toolRequests = [...(node.toolRequests ?? []), ...transcript.toolRequests];
    }
    if (transcript.contextUpdates.toolEvidence?.length) {
      node.context.toolEvidence = transcript.contextUpdates.toolEvidence;
    }
    await this.recordCompactDebateCache(node, transcript);
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
      const threshold = getPruneThresholdForDepth(
        node.depth,
        this.config.pruneThreshold,
        this.config.pruneSchedule
      );
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

  private async recordCompactDebateCache(node: TreeNode, transcript: NonNullable<TreeNode["debate"]>): Promise<void> {
    if (!transcript.compactState) return;
    const key = buildCacheKey({
      kind: "compact-debate-summary",
      provider: this.config.llmProvider,
      model: modelForStage(this.config, "summarizer"),
      promptVersion: CACHE_PROMPT_VERSION,
      input: {
        nodeContext: node.context,
        rounds: transcript.rounds,
      },
      repoFingerprint: this.repoFingerprint,
    });
    await this.cache.set({
      key,
      kind: "compact-debate-summary",
      value: transcript.compactState,
      createdAt: new Date().toISOString(),
      model: modelForStage(this.config, "summarizer"),
      promptVersion: CACHE_PROMPT_VERSION,
      repoFingerprint: this.repoFingerprint,
    });
    this.syncCacheStats();
  }

  private async sketchAndSelectLeaves(root: TreeNode): Promise<TreeNode[]> {
    const leaves = this.collectLeaves(root).filter((n) => n.status !== "pruned");
    const tasks = leaves.map((leaf) => async () => {
      leaf.implementationSketch = await this.sketcher.sketch(leaf);
      leaf.sketchScore = await this.sketcher.score(leaf, leaf.implementationSketch);
    });
    await runWithConcurrency(tasks, this.config.leafConcurrency);

    const ranked = [...leaves].sort((a, b) =>
      (b.sketchScore?.composite ?? 0) - (a.sketchScore?.composite ?? 0)
    );
    const topN = this.config.sketchExecutionTopN ?? DEFAULT_RUN_CONFIG.sketchExecutionTopN ?? 2;
    const selected = new Set(ranked.slice(0, Math.max(1, topN)).map((leaf) => leaf.id));
    for (const leaf of ranked) {
      if (selected.has(leaf.id)) {
        leaf.skippedExecutionReason = undefined;
      } else {
        leaf.skippedExecutionReason = `Skipped before Codex execution: sketch ranked below top ${topN}.`;
      }
    }
    await this.store.save(this.runState);
    return ranked.filter((leaf) => selected.has(leaf.id));
  }

  private nextSketchFallback(root: TreeNode, executedLeaves: TreeNode[]): TreeNode | undefined {
    if (!this.config.enableSketchRanking || this.config.verificationCommands.length === 0) return undefined;
    const topN = this.config.sketchExecutionTopN ?? DEFAULT_RUN_CONFIG.sketchExecutionTopN ?? 2;
    if (executedLeaves.length < Math.min(2, topN)) return undefined;
    const allFailedRequired = executedLeaves.every((leaf) =>
      !leaf.executionResult?.success || (leaf.executionResult.verification?.requiredFailed ?? 0) > 0
    );
    if (!allFailedRequired) return undefined;
    return this.collectLeaves(root)
      .filter((leaf) => leaf.skippedExecutionReason && leaf.sketchScore)
      .sort((a, b) => (b.sketchScore?.composite ?? 0) - (a.sketchScore?.composite ?? 0))[0];
  }

  private async executeLeaves(root: TreeNode, leavesToExecute?: TreeNode[]): Promise<void> {
    const leaves = leavesToExecute ?? this.collectLeaves(root).filter((n) => n.status !== "pruned");
    const tasks = leaves.map((leaf) => async () => {
      this.callbacks.onLeafExecuting?.(leaf.id);
      leaf.status = "executing";
      try {
        leaf.executionResult = await this.codex.execute(leaf);
        if (this.config.verificationCommands.length > 0 && !this.config.dryRun && !this.config.cloudEnv) {
          const artifactDirectory = join(this.config.workingDirectory, leaf.id);
          leaf.executionResult.verification = await this.cachedArtifact(
            "verification-result",
            artifactDirectory,
            { commands: this.config.verificationCommands },
            () => new VerificationRunner(this.config.verificationCommands).run(artifactDirectory)
          );
        } else if (this.config.verificationCommands.length > 0 && this.config.cloudEnv) {
          leaf.executionResult.output +=
            "\n\nVerification skipped: Codex Cloud results must be applied locally before verification can run.";
        }
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
      const artifactDirectory = join(this.config.workingDirectory, leaf.id);
      const score = await this.cachedArtifact(
        "judge-result",
        artifactDirectory,
        {
          nodeId: leaf.id,
          context: leaf.context,
          executionResult: leaf.executionResult,
        },
        () => this.judge.score(leaf),
        modelForStage(this.config, "judge")
      );
      leaf.score = score;
      if (leaf.executionResult) {
        leaf.fitness = computeFitnessScore(score, leaf.executionResult);
      }
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
        fitness: leaf.fitness,
      }))
      .sort((a, b) => (b.fitness?.composite ?? b.score.composite) - (a.fitness?.composite ?? a.score.composite));
  }

  private collectLeaves(node: TreeNode): TreeNode[] {
    if (node.status === "pruned") return [];
    if (this.isLeaf(node)) return [node];
    return node.children.flatMap((c) => this.collectLeaves(c));
  }

  private countBudgetedToolRequests(node: TreeNode): number {
    const own = (node.toolRequests ?? []).filter((request) =>
      request.status === "running" || request.status === "completed" || request.status === "failed"
    ).length;
    return own + node.children.reduce((total, child) => total + this.countBudgetedToolRequests(child), 0);
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
