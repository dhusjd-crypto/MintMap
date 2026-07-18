import { AIError, messageForStatus, type AIProvider, type ChatMessage, type ChatOptions, type ChatResult, type ProviderId } from "./aiTypes";

// One adapter for every OpenAI-compatible endpoint. OpenRouter, OpenAI,
// the Lovable gateway and Ollama all speak the same /chat/completions shape,
// so they differ only by baseUrl + key + headers. Gemini reuses this too via
// its OpenAI-compatible endpoint (see geminiProvider.ts).

const TRANSIENT = new Set([408, 409, 429, 500, 502, 503, 504]);

async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let delay = 800;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if (!TRANSIENT.has(res.status) || attempt === retries) return res;
    const retryAfter = res.headers.get("retry-after");
    const wait = retryAfter ? Math.min(5000, Math.max(500, Number(retryAfter) * 1000 || delay)) : delay;
    await new Promise((r) => setTimeout(r, wait));
    delay *= 2;
  }
  return fetch(url, init);
}

export type OpenAICompatibleConfig = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  /** Read lazily — on Workers env binds per request, so never cache at module scope. */
  getApiKey: () => string | undefined;
  defaultModel: string;
  /** Extra headers (OpenRouter wants attribution headers). */
  headers?: () => Record<string, string>;
  free?: boolean;
  /** Some gateways reject response_format on certain models. */
  supportsJsonMode?: boolean;
  /** Local servers (Ollama) need no key. */
  keyless?: boolean;
  /** Normalize a model id before sending (e.g. Gemini wants a "models/" prefix). */
  normalizeModel?: (model: string) => string;
};

export function createOpenAICompatibleProvider(cfg: OpenAICompatibleConfig): AIProvider {
  return {
    id: cfg.id,
    label: cfg.label,
    defaultModel: cfg.defaultModel,
    free: cfg.free,
    isConfigured() {
      return cfg.keyless ? true : !!cfg.getApiKey();
    },
    async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
      const key = cfg.getApiKey();
      if (!cfg.keyless && !key) throw new AIError(`${cfg.label} anahtarı yapılandırılmamış`, { provider: cfg.id });

      const rawModel = opts.model || cfg.defaultModel;
      const model = cfg.normalizeModel ? cfg.normalizeModel(rawModel) : rawModel;
      const wantsJson = opts.jsonMode && cfg.supportsJsonMode !== false;

      const res = await fetchWithRetry(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          ...(cfg.headers?.() ?? {}),
        },
        body: JSON.stringify({
          model,
          messages,
          ...(wantsJson ? { response_format: { type: "json_object" } } : {}),
          ...(opts.tools ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto" } : {}),
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new AIError(messageForStatus(res.status, cfg.id, body), { status: res.status, provider: cfg.id });
      }

      const json = (await res.json()) as {
        model?: string;
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments?: string } }> };
        }>;
      };
      const choice = json.choices?.[0];
      return {
        content: (choice?.message?.content ?? "").toString().trim(),
        toolCalls: (choice?.message?.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments ?? "{}",
        })),
        finishReason: choice?.finish_reason,
        model: json.model ?? model,
        provider: cfg.id,
      };
    },
  };
}

/**
 * OpenRouter — one key, many models (including free ones).
 * Model is configurable via OPENROUTER_MODEL; defaults to a free model, so
 * expect 429s under load — surfaced as a rate-limit warning.
 */
export function openRouterProvider(): AIProvider {
  return createOpenAICompatibleProvider({
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    getApiKey: () => process.env.OPENROUTER_API_KEY,
    defaultModel: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free",
    free: !process.env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL.endsWith(":free"),
    headers: () => ({
      // OpenRouter uses these for attribution / rankings; harmless if unset.
      "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:8080",
      "X-Title": "MintMap",
    }),
  });
}

/** Plain OpenAI. */
export function openAIProvider(): AIProvider {
  return createOpenAICompatibleProvider({
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    getApiKey: () => process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  });
}

/** Lovable AI gateway — kept so existing deployments keep working. */
export function lovableProvider(): AIProvider {
  return createOpenAICompatibleProvider({
    id: "lovable",
    label: "Lovable Gateway",
    baseUrl: "https://ai.gateway.lovable.dev/v1",
    getApiKey: () => process.env.LOVABLE_API_KEY,
    defaultModel: "google/gemini-2.5-flash",
  });
}

/** Local Ollama (no key). Off unless OLLAMA_BASE_URL is set. */
export function ollamaProvider(): AIProvider {
  const base = process.env.OLLAMA_BASE_URL || "";
  return {
    ...createOpenAICompatibleProvider({
      id: "ollama",
      label: "Yerel (Ollama)",
      baseUrl: base || "http://127.0.0.1:11434/v1",
      getApiKey: () => undefined,
      keyless: true,
      defaultModel: process.env.OLLAMA_MODEL || "llama3.2",
      supportsJsonMode: false,
    }),
    isConfigured: () => !!base,
  };
}
