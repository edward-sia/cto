import OpenAI from "openai";
import { AGENT_DEFINITIONS } from "../agents/definitions.js";
import { TaskAnalysisSchema } from "../schemas/index.js";
import type { AgentRole, TaskAnalysis } from "../types/index.js";
import { AGENT_ROLES } from "../types/index.js";
import { withRetry } from "../utils/retry.js";

const DEFAULT_ANALYSIS: TaskAnalysis = {
  runMode: "implementation",
  selectedAgents: ["product-manager", "tech-lead", "developer", "qa-engineer"],
  rationale: "Default panel (dry-run or analyzer fallback)",
};

const VALID_ROLES = new Set<string>(AGENT_ROLES);

export class TaskAnalyzer {
  private openai: OpenAI;
  private model: string;
  private dryRun: boolean;

  constructor(openai: OpenAI, model: string, dryRun = false) {
    this.openai = openai;
    this.model = model;
    this.dryRun = dryRun;
  }

  async analyze(intent: string): Promise<TaskAnalysis> {
    if (this.dryRun) return DEFAULT_ANALYSIS;

    const agentDescriptions = AGENT_ROLES.map((role) => {
      const definition = AGENT_DEFINITIONS[role];
      return `- "${role}": ${definition.displayName} - participates in: ${definition.primaryPhases.join(", ")}`;
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
      const content = response.choices[0]?.message?.content ?? "";
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const raw = TaskAnalysisSchema.parse(JSON.parse(jsonStr));
      const selectedAgents = raw.selectedAgents.filter((role) =>
        VALID_ROLES.has(role)
      ) as AgentRole[];

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
