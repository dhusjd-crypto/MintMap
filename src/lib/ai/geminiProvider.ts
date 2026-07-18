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

export function geminiProvider(): AIProvider {
  return createOpenAICompatibleProvider({
    id: "gemini",
    label: "Google Gemini",
    baseUrl: GEMINI_BASE,
    // Accept either name — AI Studio hands out GEMINI_API_KEY, some Google
    // tooling uses GOOGLE_API_KEY.
    getApiKey: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    // "models/" prefix is required by the OpenAI-compatible endpoint.
    // gemini-flash-latest auto-tracks the current stable flash model, so it
    // won't 404 like a pinned version does once Google retires it for new users
    // (gemini-2.5-flash already returns "no longer available to new users").
    defaultModel: process.env.GEMINI_MODEL || "models/gemini-flash-latest",
    // Accept a bare id from Settings ("gemini-2.5-flash") and add the prefix.
    normalizeModel: (m) => (m.startsWith("models/") ? m : `models/${m}`),
    free: true,
  });
}
