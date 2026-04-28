#!/usr/bin/env node

/**
 * CLI Entry Point for Codex Tree Orchestrator (CTO)
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
import OpenAI from "openai";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "node:readline/promises";
import { TreeOrchestrator, DEFAULT_RUN_CONFIG } from "../orchestrator/orchestrator.js";
import { FileStore } from "../persistence/file-store.js";
import type { RunState, TreeNode, RunConfig } from "../types/index.js";
import { AGENT_DISPLAY_NAMES } from "../types/index.js";
import { startUiServer } from "../ui/server.js";
import { estimateRunCost, formatCostEstimate } from "../utils/cost.js";

const program = new Command();

program
  .name("cto")
  .description("Codex Tree Orchestrator — Tree-of-Thought agent orchestration for software development")
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
  .option("-w, --workdir <path>", "Working directory for Codex", process.cwd())
  .option("--token-budget <n>", "Warn when total tokens exceed this limit")
  .option("--leaf-concurrency <n>", "Max parallel leaf Codex executions", String(DEFAULT_RUN_CONFIG.leafConcurrency))
  .option("--prune-threshold <n>", "Drop alternatives whose moderator confidence is below this (0-1)", "0")
  .option("--cloud-env <id>", "Use Codex Cloud with this environment id instead of local SDK")
  .option("--cloud-attempts <n>", "Best-of-N attempts when using --cloud-env", "1")
  .option("--dry-run", "Skip all LLM and Codex calls — exercise tree shape only", false)
  .option("-y, --yes", "Skip pre-run cost confirmation", false)
  .action(async (intent: string, opts) => {
    const dryRun = Boolean(opts.dryRun);
    const openai = makeOpenAIClient(dryRun);
    const spinner = ora();

    const config: Partial<RunConfig> = {
      maxDepth: parseInt(opts.depth, 10),
      maxBranching: parseInt(opts.branching, 10),
      maxDebateRounds: parseInt(opts.rounds, 10),
      reasoningModel: opts.model,
      judgeModel: opts.model,
      workingDirectory: opts.workdir,
      tokenBudget: opts.tokenBudget ? parseInt(opts.tokenBudget, 10) : undefined,
      dryRun,
      leafConcurrency: parseInt(opts.leafConcurrency, 10),
      pruneThreshold: parseFloat(opts.pruneThreshold),
      cloudEnv: opts.cloudEnv,
      cloudAttempts: opts.cloudAttempts ? parseInt(opts.cloudAttempts, 10) : undefined,
    };

    const fullConfig: RunConfig = { ...DEFAULT_RUN_CONFIG, ...config };
    if (!dryRun) {
      const estimate = estimateRunCost(fullConfig);
      console.log(chalk.bold.white("\n🌳 Codex Tree Orchestrator — Pre-run Estimate"));
      console.log(chalk.dim(formatCostEstimate(estimate, fullConfig)));
      if (!opts.yes) {
        const ok = await confirm("Proceed?");
        if (!ok) {
          console.log(chalk.yellow("Aborted."));
          return;
        }
      }
    }

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
          switch (event.type) {
            case "round_start":
              spinner.text = chalk.blue(`[${nodeId.slice(0, 12)}] Debate round ${event.round}/${event.totalRounds}`);
              break;
            case "agent_speaking":
              spinner.text = chalk.cyan(`[${nodeId.slice(0, 12)}] ${AGENT_DISPLAY_NAMES[event.agent]} is speaking...`);
              break;
            case "agent_spoke":
              console.log(chalk.dim(`  ${AGENT_DISPLAY_NAMES[event.agent]}: ${event.message.slice(0, 100)}...`));
              break;
            case "moderator_assessment": {
              const icon = event.outcome.outcome === "consensus" ? "✅" : event.outcome.outcome === "diverging" ? "🔀" : "🔄";
              console.log(chalk.yellow(`  ${icon} Moderator: ${event.outcome.outcome.toUpperCase()} — ${event.outcome.summary.slice(0, 100)}`));
              break;
            }
            case "debate_complete":
              spinner.succeed(chalk.green(`[${nodeId.slice(0, 12)}] Debate ${event.outcome === "consensus" ? "reached consensus" : "branching"}`));
              spinner.start();
              break;
          }
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
        onRunComplete: (state) => {
          spinner.stop();
          printResults(state);
        },
        onError: (nodeId, error) => {
          console.error(chalk.red(`\n❌ [${nodeId.slice(0, 12)}] Error: ${error.message}`));
        },
      }
    );

    console.log(chalk.bold.white("\n🌳 Codex Tree Orchestrator"));
    console.log(chalk.dim(`Intent: ${intent}`));
    console.log(chalk.dim(`Config: depth=${opts.depth}, branching=${opts.branching}, rounds=${opts.rounds}, model=${opts.model}, leaf-concurrency=${opts.leafConcurrency}, prune-threshold=${opts.pruneThreshold}`));
    console.log(chalk.dim(`Working dir: ${opts.workdir}`));
    if (opts.cloudEnv) console.log(chalk.cyan(`Codex Cloud: env=${opts.cloudEnv}, attempts=${opts.cloudAttempts ?? 1}`));
    if (dryRun) console.log(chalk.yellow("Mode: DRY RUN — no LLM or Codex calls will be made"));
    console.log();

    spinner.start("Initialising...");

    try {
      await orchestrator.run(intent);
    } catch (error) {
      spinner.fail(chalk.red("Run failed"));
      console.error(error);
      process.exit(1);
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
  .option("--dry-run", "Skip all LLM and Codex calls", false)
  .option("--leaf-concurrency <n>", "Override max parallel leaf executions on resume")
  .action(async (runId: string, opts) => {
    const dryRun = Boolean(opts.dryRun);
    const openai = makeOpenAIClient(dryRun);
    const orchestrator = new TreeOrchestrator(openai, {
      dryRun,
      ...(opts.leafConcurrency ? { leafConcurrency: parseInt(opts.leafConcurrency, 10) } : {}),
    });
    console.log(chalk.blue(`\nResuming run ${runId}...\n`));
    try {
      const state = await orchestrator.resume(runId);
      printResults(state);
    } catch (error) {
      console.error(chalk.red("Resume failed:"), error);
      process.exit(1);
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

function makeOpenAIClient(dryRun: boolean): OpenAI {
  // The OpenAI SDK throws at construction if no API key is set. In dry-run
  // mode we never actually invoke the client, so a placeholder key is fine.
  if (dryRun && !process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: "dry-run-placeholder" });
  }
  return new OpenAI();
}

function printResults(state: RunState): void {
  console.log(chalk.bold.white("\n═══════════════════════════════════════"));
  console.log(chalk.bold.white("  🌳 ORCHESTRATION RESULTS"));
  console.log(chalk.bold.white("═══════════════════════════════════════\n"));
  console.log(`${chalk.bold("Run ID:")}     ${state.id}`);
  console.log(`${chalk.bold("Intent:")}     ${state.intent}`);
  console.log(`${chalk.bold("Status:")}     ${state.status}`);
  console.log(`${chalk.bold("Mode:")}       ${state.runMode ?? "implementation"}`);
  console.log(`${chalk.bold("Leaves:")}     ${state.leafNodeIds.length}`);
  console.log(`${chalk.bold("Tokens:")}     ${state.totalTokensUsed.toLocaleString()} (debate + judge)`);
  if (state.codexUsageTotal) {
    const u = state.codexUsageTotal;
    console.log(
      `${chalk.bold("Codex:")}      input=${u.inputTokens.toLocaleString()} (cached ${u.cachedInputTokens.toLocaleString()}), output=${u.outputTokens.toLocaleString()}, reasoning=${u.reasoningOutputTokens.toLocaleString()}`
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
      console.log(chalk.dim(`   FC:${r.score.functionalCompleteness} AQ:${r.score.architecturalQuality} TC:${r.score.testCoverage} IA:${r.score.intentAlignment} S:${r.score.simplicity}`));
      console.log(chalk.dim(`   ${r.score.rationale}`));
      console.log();
    }
  }
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
