import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LLM_PROVIDER_CONFIG } from "./config.js";
import type { LLMProviderConfig, ModelTier } from "./types.js";

const CONFIG_FILE_NAMES = [
  "llm-providers.config.mjs",
  "llm-providers.config.js",
  "llm-providers.config.cjs",
  "llm-providers.config.json",
];

export interface LoadedLLMProviderConfig {
  config: LLMProviderConfig;
  path?: string;
}

export type PartialLLMProviderConfig = {
  providers?: LLMProviderConfig["providers"];
  modelTiers?: Partial<LLMProviderConfig["modelTiers"]>;
  fallback?: Partial<LLMProviderConfig["fallback"]>;
};

export async function loadLLMProviderConfig(cwd = process.cwd()): Promise<LoadedLLMProviderConfig> {
  for (const fileName of CONFIG_FILE_NAMES) {
    const candidate = join(cwd, fileName);
    if (!(await exists(candidate))) continue;
    const partial = await readConfig(candidate);
    return {
      path: candidate,
      config: mergeLLMProviderConfig(DEFAULT_LLM_PROVIDER_CONFIG, partial),
    };
  }
  return { config: DEFAULT_LLM_PROVIDER_CONFIG };
}

export function mergeLLMProviderConfig(
  base: LLMProviderConfig,
  partial: PartialLLMProviderConfig
): LLMProviderConfig {
  return {
    providers: {
      ...base.providers,
      ...(partial.providers ?? {}),
    },
    modelTiers: {
      cheap: partial.modelTiers?.cheap ?? base.modelTiers.cheap,
      mid: partial.modelTiers?.mid ?? base.modelTiers.mid,
      strong: partial.modelTiers?.strong ?? base.modelTiers.strong,
    } satisfies Record<ModelTier, LLMProviderConfig["modelTiers"][ModelTier]>,
    fallback: {
      ...base.fallback,
      ...(partial.fallback ?? {}),
    },
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function readConfig(path: string): Promise<PartialLLMProviderConfig> {
  if (path.endsWith(".json")) {
    return JSON.parse(await readFile(path, "utf8")) as PartialLLMProviderConfig;
  }
  const module = await import(`${pathToFileURL(path).href}?t=${Date.now()}`);
  return (module.default ?? module.config ?? module) as PartialLLMProviderConfig;
}

