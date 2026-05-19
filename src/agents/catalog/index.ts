import type { AgentRole } from "../../types/index.js";
import { withBoundaries } from "../prompts/shared-sections.js";
import type { AgentDefinition, RawAgentDefinition } from "../types.js";
import { AGENT_BOUNDARIES } from "./boundaries.js";
import { RAW_AGENT_DEFINITIONS } from "./roles.js";

export const AGENT_DEFINITIONS: Record<AgentRole, AgentDefinition> = Object.fromEntries(
  (Object.entries(RAW_AGENT_DEFINITIONS) as Array<[AgentRole, RawAgentDefinition]>).map(
    ([role, definition]) => {
      const boundary = AGENT_BOUNDARIES[role];
      return [
        role,
        {
          ...definition,
          ...boundary,
          systemPrompt: withBoundaries(definition.systemPrompt, boundary),
        },
      ];
    }
  )
) as Record<AgentRole, AgentDefinition>;
