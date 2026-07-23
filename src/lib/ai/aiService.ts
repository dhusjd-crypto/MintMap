import { AIError, type AIProvider, type ChatMessage, type ChatOptions, type ChatResult, type ProviderId, type ProviderStatus } from "./aiTypes";
import { geminiProvider } from "./geminiProvider";
import { mockProvider } from "./mockProvider";
import { ollamaProvider, openAIProvider, openRouterProvider } from "./openRouterProvider";

// The single entry point every server function goes through. Swapping models
// or adding a provider happens here, not in 15 scattered handlers.
//
// SERVER-ONLY — reads process.env. Never import from a component.

/** Order we auto-pick from when the user hasn't chosen. Gemini is the primary
 * infrastructure for the project; the rest are optional fallbacks. */
const PRIORITY: ProviderId[] = ["gemini", "openrouter", "openai", "ollama"];

function build(): Record<Exclude<ProviderId, "off" | "mock">, AIProvider> {
  return {
    gemini: geminiProvider(),
    openrouter: openRouterProvider(),
    openai: openAIProvider(),
    ollama: ollamaProvider(),
  };
}

/** Built per call: on Workers env binds at request time, so no module-scope cache. */
function all(): AIProvider[] {
  const m = build();
  return PRIORITY.map((id) => m[id as Exclude<ProviderId, "off" | "mock">]);
}

function forced(): ProviderId | undefined {
  const v = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  return v ? (v as ProviderId) : undefined;
}

/**
 * Pick the provider to use.
 * - explicit `pref` wins (from Settings), as long as it's configured
 * - else AI_PROVIDER env pin
 * - else first configured in PRIORITY order
 * - else the mock provider, so the app degrades to demo answers instead of dying
 */
export function resolveProvider(pref?: ProviderId): AIProvider {
  if (pref === "off") throw new AIError("AI kapalı — Ayarlar'dan bir sağlayıcı seç");
  if (pref === "mock") return mockProvider();

  const list = all();
  const pick = (id?: ProviderId) => list.find((p) => p.id === id && p.isConfigured());

  const explicit = pick(pref);
  if (explicit) return explicit;
  // Asked for a provider that has no key → be explicit rather than silently
  // answering with a different model.
  if (pref) {
    const known = list.find((p) => p.id === pref);
    if (known) throw new AIError(`${known.label} yapılandırılmamış — .env içine anahtarını ekle`, { provider: pref });
  }

  const pinned = pick(forced());
  if (pinned) return pinned;

  const auto = list.find((p) => p.isConfigured());
  return auto ?? mockProvider();
}

/** Chat through the active provider. Falls back to demo answers when unconfigured. */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}, pref?: ProviderId): Promise<ChatResult> {
  const provider = resolveProvider(pref);
  try {
    return await provider.chat(messages, opts);
  } catch (error) {
    // Model names saved in browser settings can be retired by a provider. A
    // configured default is safer than making every AI feature unusable until
    // the user manually discovers the replacement model name.
    const modelUnavailable =
      error instanceof AIError &&
      (error.status === 400 || error.status === 404) &&
      /model/i.test(error.message);
    if (!opts.model || !modelUnavailable) throw error;
    const result = await provider.chat(messages, { ...opts, model: undefined });
    return { ...result, modelFallback: true };
  }
}

/** What the Settings screen renders. */
export function aiStatusSnapshot(): {
  active: ProviderId;
  demo: boolean;
  providers: ProviderStatus[];
} {
  const list = all();
  const statuses: ProviderStatus[] = list.map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
    model: p.defaultModel,
    free: p.free,
  }));
  const active = list.find((p) => p.id === forced() && p.isConfigured()) ?? list.find((p) => p.isConfigured());
  return {
    active: active?.id ?? "mock",
    demo: !active,
    providers: statuses,
  };
}

/** Transcription via the active provider (OpenAI-compatible /audio/transcriptions). */
export async function transcribe(
  audio: Uint8Array,
  mime: string,
  language?: string,
  pref?: ProviderId,
): Promise<{ text: string; demo?: boolean }> {
  const provider = resolveProvider(pref);
  if (provider.transcribe) {
    return { text: await provider.transcribe(audio, mime, language), demo: provider.id === "mock" };
  }
  throw new AIError(`${provider.label} ses transkripti desteklemiyor`, { provider: provider.id });
}
