// Shared contract for the AI provider layer.
//
// SERVER-ONLY: modules under src/lib/ai/ read API keys from process.env and
// must only ever be imported from inside a createServerFn handler. Never
// import them from a component.

export type ProviderId = "off" | "openrouter" | "gemini" | "openai" | "lovable" | "ollama" | "mock";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage = {
  role: ChatRole;
  /** string for plain text; parts array to attach images (vision). */
  content: string | ContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ChatOptions = {
  model?: string;
  /** Ask the model for a strict JSON object back. */
  jsonMode?: boolean;
  tools?: unknown;
  toolChoice?: unknown;
  temperature?: number;
};

export type ChatResult = {
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  finishReason?: string;
  model?: string;
  provider: ProviderId;
  /** true when the answer is a canned demo (no key configured). */
  demo?: boolean;
};

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  configured: boolean;
  /** Model actually in use. */
  model?: string;
  /** Running on a free tier that can rate-limit. */
  free?: boolean;
  note?: string;
};

export interface AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** True when an API key (and anything else required) is present. */
  isConfigured(): boolean;
  /** Model used when the caller doesn't pin one. */
  readonly defaultModel: string;
  /** Free tier → surface rate-limit warnings in the UI. */
  readonly free?: boolean;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  /** Optional: speech-to-text. Providers without it throw AIError. */
  transcribe?(audio: Uint8Array, mime: string, language?: string): Promise<string>;
}

/** Carries the upstream HTTP status so callers can map 401/402/429 to Turkish messages. */
export class AIError extends Error {
  status?: number;
  provider?: ProviderId;
  constructor(message: string, opts: { status?: number; provider?: ProviderId } = {}) {
    super(message);
    this.name = "AIError";
    this.status = opts.status;
    this.provider = opts.provider;
  }
}

/** Turns an upstream status into the message the UI already knows how to show. */
export function messageForStatus(status: number, provider: ProviderId, body = ""): string {
  if (status === 429)
    return provider === "openrouter" || provider === "gemini"
      ? "AI hız limiti — ücretsiz katman sınırına takıldı, biraz sonra dene"
      : "AI hız limiti — biraz sonra dene";
  if (status === 402) return "AI kredisi tükendi";
  if (status === 401 || status === 403) return "API anahtarı geçersiz — Ayarlar'dan kontrol et";
  // Google answers a bad AI Studio key with 400 "Please pass a valid API key",
  // not 401 — without this it surfaced as a raw "AI hatası (400)".
  if (status === 400 && /api[_ -]?key|INVALID_ARGUMENT/i.test(body))
    return "API anahtarı geçersiz — Ayarlar'dan kontrol et";
  // Wrong/unavailable model is the other common 400/404.
  if ((status === 400 || status === 404) && /model/i.test(body))
    return "Model bulunamadı — Ayarlar'dan model adını kontrol et";
  return `AI hatası (${status}): ${body.slice(0, 200)}`;
}
