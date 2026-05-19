import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadLLMProviderConfig } from "../src/index.js";

describe("loadLLMProviderConfig", () => {
  it("returns package defaults when no config file exists", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "llm-providers-empty-"));

    const loaded = await loadLLMProviderConfig(cwd);

    expect(loaded.path).toBeUndefined();
    expect(loaded.config.providers.openai.defaultModel).toBe("gpt-4o");
  });

  it("merges JSON config over package defaults", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "llm-providers-json-"));
    await writeFile(join(cwd, "llm-providers.config.json"), JSON.stringify({
      providers: {
        local: {
          adapter: "openai-compatible",
          label: "Local Gateway",
          apiKeyEnv: "LOCAL_GATEWAY_KEY",
          baseURL: "http://localhost:8080/v1",
          defaultModel: "local/default",
        },
      },
      modelTiers: {
        cheap: [{ provider: "local", model: "local/small" }],
      },
      fallback: {
        on: ["rate_limit"],
      },
    }));

    const loaded = await loadLLMProviderConfig(cwd);

    expect(loaded.path).toMatch(/llm-providers\.config\.json$/);
    expect(loaded.config.providers.openai.defaultModel).toBe("gpt-4o");
    expect(loaded.config.providers.local).toMatchObject({
      label: "Local Gateway",
      apiKeyEnv: "LOCAL_GATEWAY_KEY",
    });
    expect(loaded.config.modelTiers.cheap).toEqual([{ provider: "local", model: "local/small" }]);
    expect(loaded.config.modelTiers.mid.length).toBeGreaterThan(0);
    expect(loaded.config.fallback.on).toEqual(["rate_limit"]);
  });

  it("loads JavaScript config modules", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "llm-providers-js-"));
    await writeFile(join(cwd, "llm-providers.config.mjs"), `
      export default {
        modelTiers: {
          strong: [{ provider: "openai", model: "gpt-5.5" }]
        }
      };
    `);

    const loaded = await loadLLMProviderConfig(cwd);

    expect(loaded.path).toMatch(/llm-providers\.config\.mjs$/);
    expect(loaded.config.modelTiers.strong).toEqual([{ provider: "openai", model: "gpt-5.5" }]);
    expect(loaded.config.modelTiers.cheap.length).toBeGreaterThan(0);
  });
});

