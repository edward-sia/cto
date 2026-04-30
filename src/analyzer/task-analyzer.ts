import OpenAI from "openai";
import { AGENT_DEFINITIONS } from "../agents/definitions.js";
import { TaskAnalysisSchema } from "../schemas/index.js";
import type { AgentRole, LLMUsage, TaskAnalysis } from "../types/index.js";
import { AGENT_ROLES } from "../types/index.js";
import { withRetry } from "../utils/retry.js";
import { addUsageFromResponse, emptyUsage } from "../utils/usage.js";

const DEFAULT_IMPLEMENTATION_AGENTS: AgentRole[] = [
  "product-manager",
  "business-analyst",
  "tech-lead",
  "developer",
  "code-reviewer",
  "qa-engineer",
];

const DEFAULT_EXPLORATION_AGENTS: AgentRole[] = [
  "researcher",
  "business-analyst",
  "data-analyst",
];

const DEFAULT_ANALYSIS: TaskAnalysis = {
  runMode: "implementation",
  selectedAgents: DEFAULT_IMPLEMENTATION_AGENTS,
  rationale: "Default panel (dry-run or analyzer fallback)",
};

const VALID_ROLES = new Set<string>(AGENT_ROLES);

export class TaskAnalyzer {
  private openai: OpenAI;
  private model: string;
  private dryRun: boolean;
  private usage: LLMUsage = emptyUsage();

  constructor(openai: OpenAI, model: string, dryRun = false) {
    this.openai = openai;
    this.model = model;
    this.dryRun = dryRun;
  }

  get llmUsage(): LLMUsage {
    return { ...this.usage };
  }

  async analyze(intent: string): Promise<TaskAnalysis> {
    if (this.dryRun) return DEFAULT_ANALYSIS;

    const agentDescriptions = AGENT_ROLES.map((role) => {
      const definition = AGENT_DEFINITIONS[role];
      return [
        `- "${role}": ${definition.displayName}`,
        `  Specialty: ${definition.selectionSummary}`,
        `  Participates in: ${definition.primaryPhases.join(", ")}`,
        `  Does: ${definition.does.join("; ")}`,
        `  Does not: ${definition.doesNot.join("; ")}`,
      ].join("\n");
    }).join("\n");

    const systemPrompt = `You are a task classifier for a software development orchestration system.
Given a development intent, select the appropriate agents and determine the run mode.

## Run Modes
- "implementation": The task produces code. Use for features, bug fixes, refactors, APIs, services.
- "exploration": The task produces a research document or analysis. Use for spikes, feasibility studies, data analysis, research questions.

## Available Agents
${agentDescriptions}

## Selection Rules
- Always include at least one agent per phase that the task will go through
- For implementation: always include "developer" and "tech-lead"
- For exploration: always include "researcher" or "data-analyst" as appropriate
- Omit agents with no relevance to the intent
- Do not select specialists for concerns not grounded in the intent or verified context
- Do not add security, ML, data, DevOps, frontend, UX, API, performance, or documentation specialists unless the intent explicitly needs that specialty

Respond with ONLY valid JSON - no markdown, no explanation:
{
  "runMode": "implementation" | "exploration",
  "selectedAgents": ["role-1", "role-2"],
  "rationale": "One sentence explaining the selection"
}`;

    try {
      const response = await withRetry(() =>
        this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Intent: ${intent}` },
          ],
          temperature: 0.2,
          max_tokens: 512,
        })
      );
      addUsageFromResponse(this.usage, response);
      const content = response.choices[0]?.message?.content ?? "";
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const raw = TaskAnalysisSchema.parse(JSON.parse(jsonStr));
      const selectedAgents = normalizeSelectedAgents(raw.runMode, raw.selectedAgents);

      return {
        runMode: raw.runMode,
        selectedAgents,
        rationale: raw.rationale,
      };
    } catch {
      console.warn("\nTaskAnalyzer: failed to parse response, using default panel");
      return DEFAULT_ANALYSIS;
    }
  }
}

function normalizeSelectedAgents(
  runMode: TaskAnalysis["runMode"],
  selectedAgents: string[]
): AgentRole[] {
  const valid = selectedAgents.filter((role) => VALID_ROLES.has(role)) as AgentRole[];
  const deduped = [...new Set(valid)];

  if (deduped.length === 0) {
    return runMode === "exploration"
      ? [...DEFAULT_EXPLORATION_AGENTS]
      : [...DEFAULT_IMPLEMENTATION_AGENTS];
  }

  if (runMode === "implementation") {
    return withRequiredAgents(deduped, ["tech-lead", "developer", "qa-engineer", "code-reviewer"]);
  }

  if (!deduped.includes("researcher") && !deduped.includes("data-analyst")) {
    return ["researcher", ...deduped];
  }

  return deduped;
}

function withRequiredAgents(agents: AgentRole[], required: AgentRole[]): AgentRole[] {
  const merged = [...agents];
  for (const role of required) {
    if (!merged.includes(role)) merged.push(role);
  }
  return merged;
}
