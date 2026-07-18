import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from "./aiTypes";

// Demo provider — used when no API key is configured.
//
// Without this the whole app dies on every AI action ("no provider
// configured"). Instead we hand back a plausible, clearly-labelled demo answer
// so the flow stays usable and testable. Every result carries demo: true so the
// UI can say "AI bağlantısı yapılmadı, demo cevap gösteriliyor".
//
// Callers expect different JSON shapes, so we sniff the schema hint the prompt
// itself contains rather than guessing from the user text.

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const t = m.content.find((p) => p.type === "text");
      if (t && t.type === "text") return t.text;
    }
  }
  return "";
}

function systemText(messages: ChatMessage[]): string {
  const s = messages.find((m) => m.role === "system");
  return typeof s?.content === "string" ? s.content : "";
}

function hasImage(messages: ChatMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
}

/** First few meaningful words of the input, for a title that echoes the user. */
function shortTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Demo başlık";
  return clean.split(" ").slice(0, 6).join(" ").slice(0, 60);
}

function demoBody(messages: ChatMessage[], opts: ChatOptions): string {
  const sys = systemText(messages);
  const user = lastUserText(messages);
  const image = hasImage(messages);

  // --- Keep card categorization: {"category","tags","title"}
  if (/"category"/.test(sys)) {
    const category = image ? "Ekran görüntüleri" : /http/i.test(user) ? "Siteler" : "Fikirler";
    return JSON.stringify({
      category,
      tags: ["demo", "örnek"],
      title: image ? "Demo: ekran görüntüsü" : `Demo: ${shortTitle(user)}`,
    });
  }

  // --- Quick capture: {"title","summary","todos","tags"}
  if (/"todos"/.test(sys) && /"summary"/.test(sys)) {
    return JSON.stringify({
      title: `Demo: ${shortTitle(user)}`,
      summary: "Bu bir demo özettir — gerçek AI bağlı değil.",
      todos: ["Demo görev 1", "Demo görev 2"],
      tags: ["demo"],
    });
  }

  // --- Voice → task: {"text","dueAtISO",...}
  if (/"dueAtISO"/.test(sys) || /"reminderAtISO"/.test(sys)) {
    return JSON.stringify({
      text: shortTitle(user) || "Demo görev",
      tags: ["demo"],
      steps: [],
      starred: false,
      myDay: true,
    });
  }

  // --- Day planner: {"plan":[{id,reason}]}
  if (/"plan"/.test(sys)) {
    const ids = [...user.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
    return JSON.stringify({
      plan: ids.map((id, i) => ({ id, reason: i === 0 ? "Demo: önce bu" : "Demo sıralama" })),
    });
  }

  // --- List shapes: {"items":[...]}
  if (/"items"/.test(sys)) {
    return JSON.stringify({ items: ["Demo madde 1", "Demo madde 2", "Demo madde 3"] });
  }

  // --- Generic JSON request we don't recognise
  if (opts.jsonMode) return JSON.stringify({ demo: true, note: "AI bağlı değil — demo cevap" });

  // --- Plain prose / markdown
  return [
    "**Demo cevap** — AI bağlantısı yapılmadı, bu örnek bir çıktıdır.",
    "",
    "- Gerçek sonuçlar için Ayarlar'dan bir AI sağlayıcı bağla.",
    "- `.env` içine `OPENROUTER_API_KEY`, `GEMINI_API_KEY` veya `OPENAI_API_KEY` ekleyip sunucuyu yeniden başlat.",
    user ? `\n_Girdin:_ ${shortTitle(user)}…` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function mockProvider(): AIProvider {
  return {
    id: "mock",
    label: "Demo (AI bağlı değil)",
    defaultModel: "demo",
    isConfigured: () => true, // always available — that's the point
    async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
      // A touch of latency so loading states are exercised realistically.
      await new Promise((r) => setTimeout(r, 250));
      return {
        content: demoBody(messages, opts),
        toolCalls: [], // demo mode never mutates the user's data
        finishReason: "stop",
        model: "demo",
        provider: "mock",
        demo: true,
      };
    },
    async transcribe() {
      return "Demo transkript — AI bağlı değil.";
    },
  };
}
