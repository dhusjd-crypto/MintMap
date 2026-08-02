import { describe, expect, it } from "vitest";
import { normalizeGeminiModel } from "@/lib/ai/geminiProvider";

describe("Gemini model ids", () => {
  it("uses the OpenAI-compatible model id without a resource prefix", () => {
    expect(normalizeGeminiModel("models/gemini-2.5-flash-lite")).toBe("gemini-2.5-flash-lite");
    expect(normalizeGeminiModel("gemini-2.5-flash-lite")).toBe("gemini-2.5-flash-lite");
  });

  it("trims legacy whitespace", () => {
    expect(normalizeGeminiModel("  models/gemini-flash-latest  ")).toBe("gemini-flash-latest");
  });
});
