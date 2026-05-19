/**
 * Public agent definitions module.
 *
 * Keep this facade stable for callers while catalog data, prompt rendering,
 * and response parsing live in focused modules.
 */

export { AGENT_DEFINITIONS } from "./catalog/index.js";
export { buildAgentPrompt } from "./prompts/build-agent-prompt.js";
export { parseAgentResponse } from "./parsing/parse-agent-response.js";
export type { AgentBoundary, AgentDefinition, RawAgentDefinition } from "./types.js";
