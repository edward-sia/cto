import type { AgentRole, TreePhase } from "../types/index.js";

export interface AgentDefinition {
  role: AgentRole;
  displayName: string;
  selectionSummary: string;
  does: string[];
  doesNot: string[];
  systemPrompt: string;
  primaryPhases: TreePhase[];
  contextContributions: string[];
}

export type RawAgentDefinition = Omit<AgentDefinition, "selectionSummary" | "does" | "doesNot">;

export type AgentBoundary = Pick<
  AgentDefinition,
  "selectionSummary" | "does" | "doesNot"
>;
