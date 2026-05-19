# Provider Package Extraction Design

## Summary

Extract CTO's LLM provider runtime into a standalone monorepo package. The new package owns provider adapters, provider-native configuration, normalized request and response shapes, usage normalization, error classification, model tiers, and fallback chains. CTO remains the orchestrator: it maps CTO stages such as analyzer, debate, critic, synthesis, and judge onto package-defined model tiers.

The v1 goal is not to publish a public npm package yet. The goal is to create a clean internal package boundary that can later be published or reused by another repo without carrying CTO's tree, debate, judge, or run-state concepts with it.

## Goals

- Move provider-specific API logic out of `src/providers/llm-provider.ts` into a standalone package.
- Keep provider config native to the provider package, not CTO-specific.
- Represent `cheap`, `mid`, and `strong` as ordered fallback lists, not single models.
- Let free or low-cost models serve cheap and mid tiers, with automatic fallback for transient provider failures.
- Keep simple CLI overrides for users who want one explicit frontier model for an entire run.
- Preserve current provider behavior for OpenAI, OpenRouter, Gemini, DeepSeek, Claude, and EdenAI.
- Make future providers such as HuggingFace addable through new adapters and config entries.

## Non-Goals

- Do not move CTO stages, debate semantics, judge behavior, branch logic, caching policy, or saved-run state into the provider package.
- Do not add routing profiles such as `economy`, `balanced`, or `quality` in v1.
- Do not add many new CLI flags for tier editing.
- Do not require publishing the provider package to npm in the first implementation.
- Do not solve provider-specific advanced features such as streaming, tool calls, cache-control injection, or full structured-output mode in the first extraction unless needed to preserve current behavior.

## Package Boundary

The provider package owns:

- Provider definitions: id, label, base URL, API key environment variable, default headers, default model, and provider-specific request defaults.
- Provider adapters: OpenAI-compatible calls, Anthropic Messages calls, and later HuggingFace-specific calls.
- Request shape: normalized messages, model candidate, temperature, max tokens, reasoning effort, and provider options.
- Response shape: normalized text, raw provider response, selected provider/model, usage, and error metadata.
- Usage normalization: token counts, cache telemetry, reasoning tokens, and provider-reported cost when available.
- Error classification: rate limit, timeout, overloaded, server error, auth error, invalid model, invalid request, context length, parse/schema error, and unknown.
- Tier routing: `cheap`, `mid`, and `strong` as ordered fallback candidate lists.
- Fallback policy: which error classes allow trying the next candidate.

CTO owns:

- Stage assignments: analyzer uses cheap, debate uses mid, judge uses strong, etc.
- Prompt construction, JSON extraction, Zod validation, retries around structured parsing, and fallback behavior specific to CTO's workflow.
- Run config persistence, saved-run UI display, deterministic cache keys, and orchestration state.
- The "use one model everywhere" CLI override behavior.

## Proposed Package Layout

```text
packages/
  llm-providers/
    package.json
    tsconfig.json
    src/
      index.ts
      types.ts
      config.ts
      registry.ts
      router.ts
      errors.ts
      usage.ts
      adapters/
        openai-compatible.ts
        anthropic.ts
        huggingface.ts
    tests/
      registry.test.ts
      router.test.ts
      adapters/
        openai-compatible.test.ts
        anthropic.test.ts
```

The existing `src/providers/llm-provider.ts` becomes a CTO-facing compatibility wrapper during migration, or it is replaced with imports from `@cto/llm-providers` once call sites are moved.

## Provider-Native Config

The provider package exposes a config loader and accepts explicit config objects. CTO can use a default config file or pass a config loaded from a path.

Example v1 config:

```ts
import type { LLMProviderConfig } from "@cto/llm-providers";

const config: LLMProviderConfig = {
  providers: {
    openai: {
      adapter: "openai-compatible",
      label: "OpenAI",
      apiKeyEnv: "OPENAI_API_KEY",
      defaultModel: "gpt-4o",
    },
    openrouter: {
      adapter: "openai-compatible",
      label: "OpenRouter",
      apiKeyEnv: "OPENROUTER_API_KEY",
      baseURL: "https://openrouter.ai/api/v1",
      defaultModel: "openai/gpt-oss-120b:free",
      defaultHeaders: {
        "X-Title": "Cambrian Tree Orchestrator",
      },
    },
    gemini: {
      adapter: "openai-compatible",
      label: "Google Gemini",
      apiKeyEnv: "GEMINI_API_KEY",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      defaultModel: "gemini-3-flash-preview",
      requestDefaults: {
        reasoningEffort: "minimal",
      },
    },
    deepseek: {
      adapter: "openai-compatible",
      label: "DeepSeek",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      baseURL: "https://api.deepseek.com",
      defaultModel: "deepseek-v4-pro",
    },
    claude: {
      adapter: "anthropic",
      label: "Claude / Anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      baseURL: "https://api.anthropic.com",
      defaultModel: "claude-sonnet-4-5",
      requestDefaults: {
        anthropicVersion: "2023-06-01",
      },
    },
  },
  modelTiers: {
    cheap: [
      { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
      { provider: "gemini", model: "gemini-3-flash-preview" },
    ],
    mid: [
      { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
      { provider: "deepseek", model: "deepseek-v4-pro" },
    ],
    strong: [
      { provider: "openai", model: "gpt-4o" },
      { provider: "claude", model: "claude-sonnet-4-5" },
    ],
  },
  fallback: {
    on: ["rate_limit", "timeout", "overloaded", "server_error"],
  },
};

export default config;
```

This config belongs to the provider package because it describes providers, models, tiers, and fallback behavior. It does not mention CTO stages.

## CTO Stage Mapping

CTO keeps the current stage model, but each stage points to a package-defined tier.

Example:

```ts
const stageAssignments = {
  analyzer: "cheap",
  moderator: "cheap",
  compactSummary: "cheap",
  dossier: "mid",
  debate: "mid",
  critic: "mid",
  sketch: "mid",
  synthesis: "mid",
  judge: "strong",
} as const;
```

This mapping stays in CTO because only CTO knows what these stages mean. Another consumer of the provider package may have no analyzer, debate, critic, or judge concepts.

## CLI and Override Behavior

Keep CLI surface small.

Existing simple overrides remain:

```bash
cto run "Build X" --provider claude --model claude-sonnet-4-5
cto run "Build X" --model gpt-4o
```

When `--provider` and/or `--model` are explicit, CTO should be able to bypass tier routing for that run and use one provider/model everywhere. This preserves the current "I know what I want" escape hatch.

Normal smart routing should come from config:

```text
provider package config -> cheap/mid/strong fallback lists
CTO config -> stage to tier mapping
```

Do not add v1 flags such as `--cheap-model`, `--mid-model`, `--strong-model`, or repeated `--tier` entries.

## Fallback Semantics

Each tier is an ordered list of candidates. A call requesting `mid` tries the first candidate, then falls through only when the error class is configured as fallback-safe.

Fallback-safe errors:

- `rate_limit`
- `timeout`
- `overloaded`
- `server_error`

Fallback-blocking errors:

- `auth_error`
- `invalid_model`
- `invalid_request`
- `context_length`
- `schema_error`
- `parse_error`

The package should return enough metadata for CTO to explain the route:

```text
requestedTier: mid
attempts:
  1. openrouter/openai/gpt-oss-120b:free -> rate_limit
  2. deepseek/deepseek-v4-pro -> success
selected: deepseek/deepseek-v4-pro
```

This matters for saved-run auditability and for debugging provider behavior.

## Request and Response Contract

The provider package should expose a normalized client contract.

```ts
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  model?: string;
  provider?: string;
  tier?: "cheap" | "mid" | "strong";
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
}

export interface NormalizedLLMResponse {
  text: string;
  raw: unknown;
  usage: LLMUsage;
  provider: string;
  model: string;
  requestedTier?: "cheap" | "mid" | "strong";
  attempts: LLMAttempt[];
}
```

The contract allows either direct provider/model calls or tier-routed calls. CTO can use direct calls for CLI override mode and tier calls for normal model routing.

## HuggingFace Extension Path

HuggingFace should be treated as a future adapter family rather than assumed to be OpenAI-compatible in all cases. The package should allow an adapter to own both request translation and response normalization.

Potential future config:

```ts
huggingface: {
  adapter: "huggingface",
  label: "HuggingFace",
  apiKeyEnv: "HUGGINGFACE_API_KEY",
  baseURL: "https://router.huggingface.co/v1",
  defaultModel: "some/model",
}
```

If a HuggingFace endpoint is OpenAI-compatible, it can use the existing OpenAI-compatible adapter. If it uses a different inference shape, it gets its own adapter without changing CTO.

## Migration Plan

1. Create `packages/llm-providers` with types, usage normalization, error classification, registry, router, OpenAI-compatible adapter, and Anthropic adapter.
2. Move current provider tests from `tests/providers/llm-provider.test.ts` into package tests, preserving behavior around Claude, Gemini reasoning effort, usage normalization, and provider labels.
3. Add tier routing tests for ordered fallback behavior and fallback-blocking errors.
4. Update CTO imports so analyzer, debate, critic, synthesis, judge, and test helpers consume the package types/client.
5. Keep or replace `src/providers/llm-provider.ts` as a short compatibility wrapper during the migration.
6. Update `RunConfig` persistence to store selected provider/model metadata and tier routing metadata without leaking provider package internals.
7. Refresh README, AGENTS, CLAUDE, and architecture docs to explain the new package boundary and config model.

## Testing

Package tests:

- Provider registry supports OpenAI, OpenRouter, Gemini, DeepSeek, Claude, and EdenAI.
- EdenAI uses the OpenAI-compatible adapter and V3 gateway base URL.
- Gemini request defaults keep `reasoningEffort: "minimal"`.
- Anthropic adapter sends top-level `system`, `max_tokens`, `x-api-key`, and `anthropic-version`.
- OpenAI-compatible adapter sends `reasoning_effort` when configured.
- Usage normalization preserves input, output, cache, reasoning, and provider-cost fields.
- Router falls back on `rate_limit`, `timeout`, `overloaded`, and `server_error`.
- Router stops on auth, invalid model, invalid request, context length, parse, and schema errors.

CTO tests:

- CLI help remains simple and does not add tier-specific flags.
- Existing `--provider` and `--model` override behavior still works.
- Resume preserves saved provider settings and selected model metadata.
- Stage assignments map to package tiers.
- Saved-run summaries show the selected provider/model and route attempts when fallback happened.

Verification:

```bash
npm test
npm run build
```

## Implementation Decisions

- Config file path: v1 auto-loads `llm-providers.config.mjs`, `.js`, `.cjs`, or `.json` from the repo root and merges it over package defaults. TypeScript config files are not loaded directly by the built CLI.
- Package name: v1 uses the private monorepo package name `@cto/llm-providers`.
- Compatibility wrapper: `src/providers/llm-provider.ts` remains as a thin re-export so CTO call sites do not need to import package internals directly.
- Route-attempt metadata: the provider package returns per-call attempts on `NormalizedLLMResponse`; full run-state persistence can be expanded later if the UI needs richer provider-route audit trails.
