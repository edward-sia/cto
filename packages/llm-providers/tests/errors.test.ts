import { describe, expect, it } from "vitest";
import { classifyLLMError } from "../src/index.js";

describe("classifyLLMError", () => {
  it("handles provider errors with non-string code fields", () => {
    const error = Object.assign(new Error("Request timed out."), {
      code: 20,
    });

    expect(classifyLLMError(error)).toBe("timeout");
  });

  it("classifies insufficient balance errors as auth errors", () => {
    expect(classifyLLMError(Object.assign(new Error("402 Insufficient Balance"), { status: 402 }))).toBe("auth_error");
    expect(classifyLLMError(new Error("Your credit balance is too low to access the API."))).toBe("auth_error");
  });
});

