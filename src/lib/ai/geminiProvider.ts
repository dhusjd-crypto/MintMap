import { createOpenAICompatibleProvider } from "./openRouterProvider";
import type { AIProvider } from "./aiTypes";

// Google Gemini (AI Studio).
//
// Google ships an OpenAI-compatible endpoint, so this reuses the same adapter
// instead of a second HTTP implementation. Kept as its own module because the
// key names, model naming and free-tier limits are Google-specific.
//
// Free tier notes (AI Studio, supported regions):
//  - Limits are per PROJECT, not per key: RPM (requests/min), TPM (tokens/min),
//    RPD (requests/day). RPD resets at midnight Pacific Time.
//  - So a 429 here usually means "daily/minute quota", not a broken key — the
//    adapter maps it to a rate-limit message rather than an auth error.
//  - The key is only ever read server-side (process.env); it never reaches the
//    browser, which also satisfies Google's push toward restricted/auth keys.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

/**
 * Gemini's OpenAI-compatible endpoint expects the model id itself
 * ("gemini-2.5-flash-lite"), not the REST resource form ("models/...").
 * Accept both forms because older MintMap settings and environment files may
 * still contain the resource prefix.
 */
export function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//, "");
}

export function geminiProvider(): AIProvider {
  return createOpenAICompatibleProvider({
    id: "gemini",
    label: "Google Gemini",
    baseUrl: GEMINI_BASE,
    // Accept either name — AI Studio hands out GEMINI_API_KEY, some Google
    // tooling uses GOOGLE_API_KEY.
    getApiKey: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    // Flash-Lite is sufficient for categorization, short summaries and task
    // extraction, while keeping the default cost and quota usage low.
    defaultModel: normalizeGeminiModel(process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"),
    normalizeModel: normalizeGeminiModel,
    free: true,
  });
}
