#!/usr/bin/env node

/**
 * CLI Entry Point for Cambrian Tree Orchestrator (CTO)
 *
 * Usage:
 *   cto run "Build a REST API for a todo app with auth"
 *   cto run --depth 4 --branching 2 "Build a CLI tool for git management"
 *   cto resume <run-id>
 *   cto list
 *   cto show <run-id>
 *   cto tree <run-id>
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "node:readline/promises";
import { HumanReviewStore } from "../control/human-review-store.js";
import { TreeOrchestrator, DEFAULT_RUN_CONFIG } from "../orchestrator/orchestrator.js";
import { FileStore } from "../persistence/file-store.js";
import type { HumanPlanDecision, RunState, TreeNode, RunConfig } from "../types/index.js";
import { AGENT_DISPLAY_NAMES } from "../types/index.js";
import {
  LLM_PROVIDER_IDS,
  getLLMProviderDefinition,
  makeLLMClient,
  parseLLMProvider,
  providerLabel,
  resolveProviderModel,
} from "../providers/llm-provider.js";
import { startUiServer, type StartedUiServer } from "../ui/server.js";
import { estimateRunCost, formatCostEstimate, priceCodexUsage, priceLLMUsage } from "../utils/cost.js";
import { loadGroundTruth } from "../ground-truth/provider.js";
import type { DomainFacts } from "../ground-truth/types.js";
import type { DebateProgressEvent } from "../debate/engine.js";

const program = new Command();

program
  .name("cto")
  .description("Cambrian Tree Orchestrator — Tree-of-Thought agent orchestration for software development")
  .version("0.1.0");

// ─── Run ─────────────────────────────────────────────────────────────────────

program
  .command("run")
  .description("Start a new orchestration run from a high-level intent")
  .argument("<intent>", "The high-level intent or goal")
  .option("-d, --depth <n>", "Maximum tree depth", String(DEFAULT_RUN_CONFIG.maxDepth))
  .option("-b, --branching <n>", "Maximum branching factor", String(DEFAULT_RUN_CONFIG.maxBranching))
  .option("-r, --rounds <n>", "Maximum debate rounds", String(DEFAULT_RUN_CONFIG.maxDebateRounds))
  .option("-m, --model <model>", "Reasoning model", DEFAULT_RUN_CONFIG.reasoningModel)
  .option("--provider <provider>", `LLM provider for debate/judge calls (${LLM_PROVIDER_IDS.join(", ")})`, DEFAULT_RUN_CONFIG.llmProvider)
  .option("--base-url <url>", "Override the provider base URL")
  .option("--api-key-env <name>", "Environment variable that contains the provider API key")
  .option("-w, --workdir <path>", "Working directory for Codex", process.cwd())
  .option("--token-budget <n>", "Warn when total tokens exceed this limit")
  .option("--leaf-concurrency <n>", "Max parallel leaf Codex executions", String(DEFAULT_RUN_CONFIG.leafConcurrency))
  .option("--prune-threshold <n>", "Drop alternatives whose confidence × relevance-to-intent is below this (0-1)", String(DEFAULT_RUN_CONFIG.pruneThreshold))
  .option("--cloud-env <id>", "Use Codex Cloud with this environment id instead of local SDK")
  .option("--cloud-attempts <n>", "Best-of-N attempts when using --cloud-env", "1")
  .option("--dry-run", "Skip all LLM and Codex calls — exercise tree shape only", false)
  .option("--ground-truth <spec>", "Inject verified domain facts (e.g. file:./facts.json, sample:./data.csv, openapi:./spec.yaml)")
  .option("--interactive-plan", "Review candidate leaves before implementation", false)
  .option("--monitor", "Launch the live browser monitor while the run is active", false)
  .option("--ui-review", "Use the browser UI for interactive plan decisions", false)
  .option("-y, --yes", "Skip pre-run cost confirmation", false)
  .action(async (intent: string, opts, command: Command) => {
    const dryRun = Boolean(opts.dryRun);
    const llmProvider = parseProviderOrExit(opts.provider);
    const modelWasExplicit = command.getOptionValueSource("model") !== "default";
    const model = resolveProviderModel(llmProvider, opts.model, modelWasExplicit);
    const providerDefaults = getLLMProviderDefinition(llmProvider);
    const llmApiKeyEnv = opts.apiKeyEnv ?? providerDefaults.apiKeyEnv;
    const llmBaseURL = opts.baseUrl ?? providerDefaults.baseURL;
    const spinner = ora();
    const useUiReview = Boolean(opts.uiReview);
    const launchMonitor = Boolean(opts.monitor) || useUiReview;
    const humanReviewStore = new HumanReviewStore();

    const parsedDepth = parseInt(opts.depth, 10);
    const parsedBranching = parseInt(opts.branching, 10);
    const parsedRounds = parseInt(opts.rounds, 10);
    const parsedLeafConcurrency = parseInt(opts.leafConcurrency, 10);
    const parsedPruneThreshold = parseFloat(opts.pruneThreshold);

    const numericErrors: string[] = [];
    if (isNaN(parsedDepth)) numericErrors.push(`--depth: "${opts.depth}" is not a number (tip: use -d 2, not -d=2)`);
    if (isNaN(parsedBranching)) numericErrors.push(`--branching: "${opts.branching}" is not a number (tip: use -b 2, not -b=2)`);
    if (isNaN(parsedRounds)) numericErrors.push(`--rounds: "${opts.rounds}" is not a number`);
    if (isNaN(parsedLeafConcurrency)) numericErrors.push(`--leaf-concurrency: "${opts.leafConcurrency}" is not a number`);
    if (isNaN(parsedPruneThreshold)) numericErrors.push(`--prune-threshold: "${opts.pruneThreshold}" is not a number`);
    if (numericErrors.length > 0) {
      for (const err of numericErrors) console.error(chalk.red(`Error: ${err}`));
      process.exit(1);
    }

    const config: Partial<RunConfig> = {
      maxDepth: parsedDepth,
      maxBranching: parsedBranching,
      maxDebateRounds: parsedRounds,
      llmProvider,
      llmBaseURL,
      llmApiKeyEnv,
      reasoningModel: model,
      judgeModel: model,
      workingDirectory: opts.workdir,
      tokenBudget: opts.tokenBudget ? parseInt(opts.tokenBudget, 10) : undefined,
      dryRun,
      interactivePlan: Boolean(opts.interactivePlan) || useUiReview,
      leafConcurrency: parsedLeafConcurrency,
      pruneThreshold: parsedPruneThreshold,
      cloudEnv: opts.cloudEnv,
      cloudAttempts: opts.cloudAttempts ? parseInt(opts.cloudAttempts, 10) : undefined,
    };

    const fullConfig: RunConfig = { ...DEFAULT_RUN_CONFIG, ...config };
    const openai = makeLLMClientOrExit({
      provider: llmProvider,
      dryRun,
      apiKeyEnv: llmApiKeyEnv,
      baseURL: llmBaseURL,
    });

    let domainFacts: DomainFacts | undefined;
    if (opts.groundTruth) {
      try {
        const gtSpinner = ora("Loading ground truth...").start();
        domainFacts = await loadGroundTruth(opts.groundTruth, openai, fullConfig.reasoningModel);
        gtSpinner.succeed(chalk.green(`Ground truth loaded: ${domainFacts.domain}`));
        if (domainFacts.knownAbsences.length) {
          console.log(chalk.dim(`  Known absences: ${domainFacts.knownAbsences.length} item(s)`));
        }
        if (domainFacts.schemas?.length) {
          console.log(chalk.dim(`  Schemas: ${domainFacts.schemas.map((s) => s.name).join(", ")}`));
        }
        if (domainFacts.apiEndpoints?.length) {
          console.log(chalk.dim(`  API endpoints: ${domainFacts.apiEndpoints.length} route(s)`));
        }
      } catch (err) {
        console.error(chalk.red(`Failed to load ground truth: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    }

    if (!dryRun) {
      const estimate = estimateRunCost(fullConfig);
      console.log(chalk.bold.white("\n🌳 Cambrian Tree Orchestrator — Pre-run Estimate"));
      console.log(chalk.dim(formatCostEstimate(estimate, fullConfig)));
      if (!opts.yes) {
        const ok = await confirm("Proceed?");
        if (!ok) {
          console.log(chalk.yellow("Aborted."));
          return;
        }
      }
    }

    let monitorServer: StartedUiServer | undefined;

    const orchestrator = new TreeOrchestrator(
      openai,
      config,
      {
        onAnalysisComplete: (analysis) => {
          spinner.stop();
          const agentNames = analysis.selectedAgents
            .map((role) => AGENT_DISPLAY_NAMES[role])
            .join(", ");
          console.log(chalk.bold(`\n🤖 Run mode:  ${analysis.runMode}`));
          console.log(chalk.cyan(`👥 Agents:    ${agentNames}`));
          console.log(chalk.dim(`💭 Rationale: ${analysis.rationale}\n`));
          spinner.start("Building debate tree...");
        },
        onDebateProgress: (nodeId, event) => {
          printDebateProgress(nodeId, event, spinner);
        },
        onRunStarted: async (state) => {
          if (!launchMonitor || monitorServer) return;
          const restartSpinner = spinner.isSpinning;
          if (restartSpinner) spinner.stop();
          monitorServer = await startUiServer({ runId: state.id, openBrowser: true });
          console.log(chalk.cyan(`Live monitor: ${monitorServer.url}`));
          if (restartSpinner) spinner.start("Building debate tree...");
        },
        onNodeCreated: (node) => {
          console.log(chalk.magenta(`\n📌 New node: ${node.id.slice(0, 12)} (depth ${node.depth}) — ${node.branchLabel || "root"}`));
        },
        onBranching: (_parentId, alternatives) => {
          console.log(chalk.yellow(`\n🔀 Branching into ${alternatives.length} alternatives:`));
          for (const alt of alternatives) {
            console.log(chalk.yellow(`   → ${alt.label} (conf=${alt.confidence.toFixed(2)}): ${alt.description.slice(0, 80)}`));
          }
        },
        onPruned: (parentId, prunedCount, threshold) => {
          console.log(chalk.dim(`  ✂️  Pruned ${prunedCount} alternative(s) below confidence ${threshold} at ${parentId.slice(0, 12)}`));
        },
        onLeafExecuting: (nodeId) => {
          spinner.text = chalk.blue(`[${nodeId.slice(0, 12)}] Executing via Codex...`);
        },
        onLeafScored: (nodeId, score) => {
          console.log(chalk.green(`\n🏆 [${nodeId.slice(0, 12)}] Score: ${score.composite}/10 — ${score.rationale.slice(0, 80)}`));
        },
        onHumanPlanReview: async (node, state) => {
          spinner.stop();
          try {
            if (useUiReview) {
              return await reviewHumanPlanViaUi(node, state, humanReviewStore);
            }
            return await reviewHumanPlan(node, state);
          } finally {
            spinner.start("Continuing orchestration...");
          }
        },
        onHumanPlanApplied: (nodeId, decision) => {
          const label = decision.action === "revise" ? `revise: ${decision.prompt}` : decision.action;
          console.log(chalk.cyan(`\n🧭 [${nodeId.slice(0, 12)}] Human plan decision: ${label}`));
        },
        onRunComplete: (state) => {
          spinner.stop();
          printResults(state);
        },
        onError: (nodeId, error) => {
          console.error(chalk.red(`\n❌ [${nodeId.slice(0, 12)}] Error: ${error.message}`));
        },
      }
    );

    console.log(chalk.bold.white("\n🌳 Cambrian Tree Orchestrator"));
    console.log(chalk.dim(`Intent: ${intent}`));
    console.log(chalk.dim(`Config: depth=${opts.depth}, branching=${opts.branching}, rounds=${opts.rounds}, provider=${llmProvider}, model=${model}, leaf-concurrency=${opts.leafConcurrency}, prune-threshold=${opts.pruneThreshold}`));
    console.log(chalk.dim(`LLM: ${providerLabel(fullConfig)}`));
    console.log(chalk.dim(`Working dir: ${opts.workdir}`));
    if (opts.cloudEnv) console.log(chalk.cyan(`Codex Cloud: env=${opts.cloudEnv}, attempts=${opts.cloudAttempts ?? 1}`));
    if (dryRun) console.log(chalk.yellow("Mode: DRY RUN — no LLM or Codex calls will be made"));
    if (opts.interactivePlan || useUiReview) console.log(chalk.yellow(`Interactive plan gate: enabled${useUiReview ? " (browser review)" : ""}`));
    console.log();

    spinner.start("Initialising...");

    try {
      await orchestrator.run(intent, domainFacts);
    } catch (error) {
      spinner.fail(chalk.red("Run failed"));
      console.error(error);
      if (monitorServer) await monitorServer.close().catch(() => {});
      process.exit(1);
    } finally {
      if (monitorServer) await monitorServer.close().catch(() => {});
    }
  });

// ─── List ────────────────────────────────────────────────────────────────────

program
  .command("list")
  .description("List all saved runs")
  .action(async () => {
    const store = new FileStore();
    const runs = await store.listRuns();
    if (runs.length === 0) {
      console.log(chalk.dim("No runs found."));
      return;
    }
    console.log(chalk.bold("\n📋 Saved Runs\n"));
    for (const run of runs) {
      const icon = run.status === "completed" ? "✅" : run.status === "failed" ? "❌" : "🔄";
      console.log(`${icon} ${chalk.cyan(run.id)} — ${run.intent} (${chalk.dim(run.startedAt)})`);
    }
    console.log();
  });

// ─── Show ────────────────────────────────────────────────────────────────────

program
  .command("show")
  .description("Show details of a specific run")
  .argument("<run-id>", "Run ID to display")
  .action(async (runId: string) => {
    const store = new FileStore();
    const state = await store.load(runId);
    if (!state) {
      console.error(chalk.red(`Run ${runId} not found.`));
      process.exit(1);
    }
    printResults(state);
    printDiscussionTranscripts(state);
  });

// ─── Tree ────────────────────────────────────────────────────────────────────

program
  .command("tree")
  .description("Display the tree structure of a run")
  .argument("<run-id>", "Run ID to display")
  .action(async (runId: string) => {
    const store = new FileStore();
    const state = await store.load(runId);
    if (!state) {
      console.error(chalk.red(`Run ${runId} not found.`));
      process.exit(1);
    }
    console.log(chalk.bold("\n🌳 Solution Tree\n"));
    printTree(state.root, "");
    console.log();
  });

// ─── UI ──────────────────────────────────────────────────────────────────────

program
  .command("ui")
  .description("Launch the saved-run browser UI")
  .argument("[run-id]", "Run ID to open")
  .option("-p, --port <n>", "Preferred local port", "43187")
  .option("--no-open", "Print the URL without opening a browser")
  .action(async (runId: string | undefined, opts) => {
    const server = await startUiServer({
      runId,
      port: parseInt(opts.port, 10),
      openBrowser: Boolean(opts.open),
    });

    console.log(chalk.cyan(server.url));
    console.log(chalk.dim("Press Ctrl+C to stop the UI server."));

    await new Promise<void>(() => {
      let isClosing = false;
      const shutdown = (): void => {
        if (isClosing) return;
        isClosing = true;
        process.off("SIGINT", shutdown);
        void server.close().finally(() => {
          process.exit(0);
        });
      };

      process.on("SIGINT", shutdown);
    });
  });

// ─── Resume ──────────────────────────────────────────────────────────────────

program
  .command("resume")
  .description("Resume a paused or failed run")
  .argument("<run-id>", "Run ID to resume")
  .option("-m, --model <model>", "Override the saved reasoning/judge model")
  .option("--provider <provider>", `Override the saved LLM provider (${LLM_PROVIDER_IDS.join(", ")})`)
  .option("--base-url <url>", "Override the saved provider base URL")
  .option("--api-key-env <name>", "Override the saved provider API key environment variable")
  .option("--dry-run", "Skip all LLM and Codex calls", false)
  .option("--leaf-concurrency <n>", "Override max parallel leaf executions on resume")
  .option("--interactive-plan", "Enable interactive plan review on resume")
  .option("--monitor", "Launch the live browser monitor while the run resumes", false)
  .option("--ui-review", "Use the browser UI for interactive plan decisions", false)
  .action(async (runId: string, opts) => {
    const dryRun = Boolean(opts.dryRun);
    const store = new FileStore();
    const savedRun = await store.load(runId);
    if (!savedRun) {
      console.error(chalk.red(`Run ${runId} not found.`));
      process.exit(1);
    }
    const savedProvider = savedRun.config.llmProvider ?? DEFAULT_RUN_CONFIG.llmProvider;
    const llmProvider = parseProviderOrExit(opts.provider ?? savedProvider);
    const providerDefaults = getLLMProviderDefinition(llmProvider);
    const model = opts.model ?? savedRun.config.reasoningModel ?? providerDefaults.defaultModel;
    const llmBaseURL = opts.baseUrl ?? savedRun.config.llmBaseURL ?? providerDefaults.baseURL;
    const llmApiKeyEnv = opts.apiKeyEnv ?? savedRun.config.llmApiKeyEnv ?? providerDefaults.apiKeyEnv;
    const openai = makeLLMClientOrExit({
      provider: llmProvider,
      dryRun,
      apiKeyEnv: llmApiKeyEnv,
      baseURL: llmBaseURL,
    });
    const spinner = ora();
    const useUiReview = Boolean(opts.uiReview);
    const launchMonitor = Boolean(opts.monitor) || useUiReview;
    const humanReviewStore = new HumanReviewStore();
    const monitorServer = launchMonitor
      ? await startUiServer({ runId, openBrowser: true })
      : undefined;
    if (monitorServer) {
      console.log(chalk.cyan(`Live monitor: ${monitorServer.url}`));
    }
    const orchestrator = new TreeOrchestrator(openai, {
      ...(dryRun ? { dryRun } : {}),
      llmProvider,
      llmBaseURL,
      llmApiKeyEnv,
      reasoningModel: model,
      judgeModel: model,
      ...(opts.leafConcurrency ? { leafConcurrency: parseInt(opts.leafConcurrency, 10) } : {}),
      ...(opts.interactivePlan || useUiReview ? { interactivePlan: true } : {}),
    }, {
      onDebateProgress: (nodeId, event) => {
        printDebateProgress(nodeId, event, spinner);
      },
      onHumanPlanReview: (node, state) => useUiReview
        ? reviewHumanPlanViaUi(node, state, humanReviewStore)
        : reviewHumanPlan(node, state),
      onHumanPlanApplied: (nodeId, decision) => {
        const label = decision.action === "revise" ? `revise: ${decision.prompt}` : decision.action;
        console.log(chalk.cyan(`\n🧭 [${nodeId.slice(0, 12)}] Human plan decision: ${label}`));
      },
    });
    console.log(chalk.blue(`\nResuming run ${runId}...\n`));
    console.log(chalk.dim(`LLM: ${providerLabel({ llmProvider, llmBaseURL, llmApiKeyEnv })}, model=${model}`));
    try {
      const state = await orchestrator.resume(runId);
      printResults(state);
    } catch (error) {
      console.error(chalk.red("Resume failed:"), error);
      if (monitorServer) await monitorServer.close().catch(() => {});
      process.exit(1);
    } finally {
      if (monitorServer) await monitorServer.close().catch(() => {});
    }
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`\n${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function reviewHumanPlanViaUi(
  node: TreeNode,
  state: RunState,
  humanReviewStore: HumanReviewStore,
): Promise<HumanPlanDecision> {
  const pending = state.pendingHumanReview;
  if (!pending || pending.nodeId !== node.id) {
    throw new Error(`No pending browser review request for ${node.id}`);
  }

  console.log(chalk.cyan(`\n🧭 Waiting for browser review of ${node.id.slice(0, 12)}...`));
  return humanReviewStore.waitForDecision(state.id, pending.requestId);
}

async function reviewHumanPlan(node: TreeNode, state: RunState): Promise<HumanPlanDecision> {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive plan mode requires an interactive terminal.");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const path = getPathLabelsForNode(state.root, node.id).join(" → ") || "(root)";
    const summary = node.debate?.summary || node.branchDescription || "No summary recorded.";
    console.log(chalk.bold.white("\n🧭 Interactive Plan Review"));
    console.log(`${chalk.bold("Leaf:")}    ${node.id.slice(0, 12)} (depth ${node.depth})`);
    console.log(`${chalk.bold("Path:")}    ${path}`);
    console.log(`${chalk.bold("Summary:")} ${summary.slice(0, 500)}${summary.length > 500 ? "…" : ""}`);

    while (true) {
      const raw = await rl.question("\nChoose: [p]roceed, [r]evise once, [k]ill  ");
      const answer = raw.trim().toLowerCase();
      if (answer === "p" || answer === "proceed") return { action: "proceed" };

      if (answer === "r" || answer === "revise") {
        while (true) {
          const prompt = (await rl.question("Revision prompt: ")).trim();
          if (prompt) return { action: "revise", prompt };
          console.log(chalk.yellow("Revision prompt cannot be empty."));
        }
      }

      if (answer === "k" || answer === "kill") {
        if (state.leafNodeIds.length <= 1) {
          const confirmKill = await rl.question(
            chalk.yellow("This is the final executable leaf. Kill it and pause the run? [y/N] ")
          );
          if (!/^y(es)?$/i.test(confirmKill.trim())) continue;
        }
        return { action: "kill" };
      }

      console.log(chalk.yellow("Please choose proceed, revise, or kill."));
    }
  } finally {
    rl.close();
  }
}

function parseProviderOrExit(raw: string | undefined): RunConfig["llmProvider"] {
  try {
    return parseLLMProvider(raw);
  } catch (err) {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

function makeLLMClientOrExit(options: Parameters<typeof makeLLMClient>[0]): ReturnType<typeof makeLLMClient> {
  try {
    return makeLLMClient(options);
  } catch (err) {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

function printDebateProgress(
  nodeId: string,
  event: DebateProgressEvent,
  spinner?: ReturnType<typeof ora>
): void {
  switch (event.type) {
    case "round_start":
      if (spinner) {
        spinner.text = chalk.blue(`[${nodeId.slice(0, 12)}] Debate round ${event.round}/${event.totalRounds}`);
      }
      break;
    case "agent_speaking":
      if (spinner) {
        spinner.text = chalk.cyan(`[${nodeId.slice(0, 12)}] ${AGENT_DISPLAY_NAMES[event.agent]} is speaking...`);
      }
      break;
    case "agent_spoke":
      withPausedSpinner(spinner, () => {
        console.log(chalk.bold.cyan(`\n── ${nodeId.slice(0, 12)} · Round ${event.round} · ${AGENT_DISPLAY_NAMES[event.agent]} ──`));
        console.log(chalk.bold(`${AGENT_DISPLAY_NAMES[event.agent]}:`));
        console.log(event.message);
      });
      break;
    case "moderator_assessment":
      withPausedSpinner(spinner, () => {
        printModeratorAssessment(event);
      });
      break;
    case "debate_complete":
      if (spinner) {
        spinner.succeed(chalk.green(`[${nodeId.slice(0, 12)}] Debate ${event.outcome === "consensus" ? "reached consensus" : "branching"}`));
        spinner.start();
      }
      break;
  }
}

function withPausedSpinner(spinner: ReturnType<typeof ora> | undefined, print: () => void): void {
  const shouldRestart = Boolean(spinner?.isSpinning);
  if (shouldRestart) spinner?.stop();
  try {
    print();
  } finally {
    if (shouldRestart) spinner?.start();
  }
}

function printModeratorAssessment(
  event: Extract<DebateProgressEvent, { type: "moderator_assessment" }>
): void {
  console.log(chalk.bold.yellow(`\n── Moderator · Round ${event.round} · ${event.outcome.outcome.toUpperCase()} ──`));
  console.log(event.outcome.summary);
  if (event.outcome.alternatives.length > 0) {
    console.log(chalk.yellow("\nAlternatives:"));
    for (const alt of event.outcome.alternatives) {
      console.log(chalk.yellow(`- ${alt.label} (conf=${alt.confidence.toFixed(2)}, relevance=${alt.relevanceToIntent.toFixed(2)})`));
      console.log(`  ${alt.description}`);
      console.log(chalk.dim(`  Rationale: ${alt.rationale}`));
    }
  }
}

function printResults(state: RunState): void {
  console.log(chalk.bold.white("\n═══════════════════════════════════════"));
  console.log(chalk.bold.white("  🌳 ORCHESTRATION RESULTS"));
  console.log(chalk.bold.white("═══════════════════════════════════════\n"));
  console.log(`${chalk.bold("Run ID:")}     ${state.id}`);
  console.log(`${chalk.bold("Intent:")}     ${state.intent}`);
  console.log(`${chalk.bold("Status:")}     ${state.status}`);
  console.log(`${chalk.bold("Mode:")}       ${state.runMode ?? "implementation"}`);
  console.log(`${chalk.bold("Provider:")}   ${providerLabel(state.config)}`);
  console.log(`${chalk.bold("Model:")}      ${state.config.reasoningModel}`);
  console.log(`${chalk.bold("Leaves:")}     ${state.leafNodeIds.length}`);
  console.log(`${chalk.bold("Tokens:")}     ${state.totalTokensUsed.toLocaleString()} (debate + judge)`);
  if (state.llmUsage) {
    const u = state.llmUsage;
    const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens);
    const { usd, modelKnown } = priceLLMUsage(u, state.config.reasoningModel);
    const note = modelKnown ? "" : " *price unknown — used gpt-4o rates";
    console.log(
      `${chalk.bold("LLM:")}        input=${u.inputTokens.toLocaleString()} (uncached ${uncached.toLocaleString()}, cached ${u.cachedInputTokens.toLocaleString()}), output=${u.outputTokens.toLocaleString()} — ~$${usd.toFixed(4)}${note}`
    );
  }
  if (state.codexUsageTotal) {
    const u = state.codexUsageTotal;
    const { usdProxy } = priceCodexUsage(u);
    console.log(
      `${chalk.bold("Codex:")}      input=${u.inputTokens.toLocaleString()} (cached ${u.cachedInputTokens.toLocaleString()}), output=${u.outputTokens.toLocaleString()}, reasoning=${u.reasoningOutputTokens.toLocaleString()} — ~$${usdProxy.toFixed(4)} on API-key auth (otherwise covered by ChatGPT plan)`
    );
  }
  console.log(`${chalk.bold("Duration:")}   ${state.completedAt ? timeDiff(state.startedAt, state.completedAt) : "in progress"}`);

  if (state.runMode === "exploration") {
    const docs = collectLeafOutputs(state.root);
    if (docs.length > 0) {
      console.log(chalk.bold("\n📄 Exploration Documents\n"));
      for (const doc of docs) {
        console.log(chalk.bold.cyan(`\n─── ${doc.path} ───\n`));
        console.log(doc.output);
      }
    }
    return;
  }

  if (state.rankedResults?.length) {
    console.log(chalk.bold("\n🏆 Ranked Solutions (best → worst)\n"));
    for (let i = 0; i < state.rankedResults.length; i++) {
      const r = state.rankedResults[i];
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
      console.log(`${medal} ${chalk.bold(r.score.composite.toFixed(1))}/10 — Path: ${chalk.cyan(r.path.join(" → ") || "(root)")}`);
      console.log(chalk.dim(`   FC:${r.score.functionalCompleteness} AQ:${r.score.architecturalQuality} TC:${r.score.testCoverage} IA:${r.score.intentAlignment} RWF:${r.score.realWorldFit} S:${r.score.simplicity}`));
      console.log(chalk.dim(`   ${r.score.rationale}`));
      console.log();
    }
  }
}

function printDiscussionTranscripts(state: RunState): void {
  const nodes = collectDebatedNodes(state.root);
  console.log(chalk.bold.white("\n═══════════════════════════════════════"));
  console.log(chalk.bold.white("  💬 FULL DISCUSSIONS"));
  console.log(chalk.bold.white("═══════════════════════════════════════\n"));

  if (nodes.length === 0) {
    console.log(chalk.dim("No debate transcripts recorded."));
    return;
  }

  for (const node of nodes) {
    const path = getPathLabelsForNode(state.root, node.id).join(" → ") || "(root)";
    console.log(chalk.bold.cyan(`\nNode ${node.id.slice(0, 12)} — ${path}`));
    console.log(chalk.dim(`Phase: ${node.phase} · Summary: ${node.debate?.summary ?? "No summary recorded."}`));

    for (const round of node.debate?.rounds ?? []) {
      console.log(chalk.bold(`\nRound ${round.roundNumber} — ${round.outcome.toUpperCase()}`));
      for (const message of round.messages) {
        console.log(chalk.bold(`\n${AGENT_DISPLAY_NAMES[message.role]}:`));
        console.log(message.content);
      }
      if (round.alternatives.length > 0) {
        console.log(chalk.bold("\nAlternatives:"));
        for (const alt of round.alternatives) {
          console.log(`- ${alt.label}: ${alt.description}`);
          console.log(chalk.dim(`  Rationale: ${alt.rationale}`));
        }
      }
    }
  }
}

function collectDebatedNodes(node: TreeNode): TreeNode[] {
  const current = node.debate ? [node] : [];
  return [...current, ...node.children.flatMap((child) => collectDebatedNodes(child))];
}

function collectLeafOutputs(
  node: TreeNode,
  pathSoFar: string[] = []
): Array<{ path: string; output: string }> {
  const currentPath = node.branchLabel
    ? [...pathSoFar, node.branchLabel]
    : pathSoFar;
  if (node.children.length === 0 && node.executionResult) {
    return [
      {
        path: currentPath.join(" → ") || "(root)",
        output: node.executionResult.output,
      },
    ];
  }
  return node.children.flatMap((child) => collectLeafOutputs(child, currentPath));
}

function printTree(node: TreeNode, prefix: string, isLast = true): void {
  const connector = isLast ? "└── " : "├── ";
  const icons: Record<string, string> = {
    pending: "⏳", debating: "💬", branched: "🔀", consensus: "✅",
    executing: "⚙️", completed: "✅", scored: "🏆",
  };
  const icon = icons[node.status] ?? "❓";
  const label = node.branchLabel || "root";
  const scoreStr = node.score ? chalk.green(` (${node.score.composite.toFixed(1)}/10)`) : "";

  console.log(`${prefix}${connector}${icon} ${chalk.bold(label)}${scoreStr} ${chalk.dim(`[${node.id.slice(0, 8)}] d=${node.depth}`)}`);

  const childPrefix = prefix + (isLast ? "    " : "│   ");
  for (let i = 0; i < node.children.length; i++) {
    printTree(node.children[i], childPrefix, i === node.children.length - 1);
  }
}

function getPathLabelsForNode(root: TreeNode, targetId: string): string[] {
  const path: string[] = [];
  const visit = (node: TreeNode): boolean => {
    if (node.id === targetId) {
      if (node.branchLabel) path.push(node.branchLabel);
      return true;
    }
    for (const child of node.children) {
      if (visit(child)) {
        if (node.branchLabel) path.unshift(node.branchLabel);
        return true;
      }
    }
    return false;
  };
  visit(root);
  return path;
}

function timeDiff(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

program.parse();
