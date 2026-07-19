import { createServerFn } from "@tanstack/react-start";
import { aiStatusSnapshot, chat as runChat } from "./ai/aiService";
import type { ChatMessage, ProviderId } from "./ai/aiTypes";
import { requireAppAuth } from "./auth.middleware";

// Every cost-bearing AI endpoint below chains `.middleware([requireAppAuth])`
// so the owner's API quota can't be abused from the public URL. (aiStatus stays
// open — it only reports which providers are configured and costs nothing.)
//
// NOTE: the createServerFn(...) call must stay written out inline — TanStack
// Start's compiler statically detects these calls to split server/client code.
// Hiding it behind a helper silently breaks the RPC (handlers return undefined).

// Provider selection, retries and 401/402/429 → message mapping now live in
// src/lib/ai/. These handlers only build prompts and parse results.

/** Accepts the legacy "gateway" value older clients still have in localStorage. */
type Provider = ProviderId | "gateway";
type Msg = { role: "system" | "user" | "assistant"; content: string };

const FALLBACK_STATUSES = new Set([401, 402, 429, 500, 502, 503, 504]);

/** Legacy clients stored "gateway" (the old Lovable option). Treat it as
 * "let the server auto-pick", which now lands on Gemini (primary). */
function normalizeProvider(pref?: string): ProviderId | undefined {
  if (!pref || pref === "gateway") return undefined;
  return pref as ProviderId;
}

/** Retry transient failures (429/500/502/503) with exponential backoff. */
async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let delay = 800;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    const transient =
      res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503;
    if (!transient || attempt === retries) return res;
    // honor Retry-After when present
    const ra = res.headers.get("retry-after");
    const wait = ra ? Math.min(5000, Math.max(500, Number(ra) * 1000 || delay)) : delay;
    await new Promise((r) => setTimeout(r, wait));
    delay *= 2;
  }
  // unreachable
  return fetch(url, init);
}

/**
 * Runs one chat through the provider layer (Gemini / OpenRouter / OpenAI /
 * Ollama, or the demo provider when nothing is configured).
 */
async function chatCompletion(
  messages: unknown[],
  opts: {
    provider?: Provider;
    model?: string;
    jsonMode?: boolean;
    tools?: unknown;
    toolChoice?: unknown;
  } = {},
) {
  return runChat(
    messages as ChatMessage[],
    { model: opts.model, jsonMode: opts.jsonMode, tools: opts.tools, toolChoice: opts.toolChoice },
    normalizeProvider(opts.provider),
  );
}

async function callAI(
  messages: Msg[],
  jsonMode = false,
  opts: { provider?: Provider; model?: string } = {},
): Promise<string> {
  const res = await chatCompletion(messages, { ...opts, jsonMode });
  return res.content;
}

/** Returns which providers are configured server-side. Safe to expose. */
export const aiStatus = createServerFn({ method: "GET" }).handler(async () => {
  const snap = aiStatusSnapshot();
  return {
    active: snap.active,
    /** true → nothing configured, answers come from the demo provider. */
    demo: snap.demo,
    providers: snap.providers,
  };
});

/**
 * Transcribe an audio recording. Gemini (native generateContent with inline
 * audio) is the primary; OpenAI Whisper is an optional fallback if its key is
 * set. Explicit `provider` ("gemini"/"openai") pins one; "gateway" (legacy) and
 * default auto-pick Gemini first.
 */
export const aiTranscribe = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator((data: { audio: string; mime?: string; language?: string; provider?: Provider }) => {
    if (!data.audio) throw new Error("audio gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const bin = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    if (bin.byteLength < 1024) throw new Error("Kayıt çok kısa — tekrar dene");
    const mime = data.mime || "audio/webm";
    const lang = data.language || "tr";

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!geminiKey && !openaiKey) throw new Error("Hiçbir AI sağlayıcı yapılandırılmamış");

    type STTError = { provider: string; status: number; body: string };

    // Gemini native transcription — send the audio inline to generateContent.
    async function viaGemini(): Promise<string> {
      const model = process.env.GEMINI_STT_MODEL || "gemini-flash-latest";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Bu ses kaydını (${lang}) birebir yazıya dök. Sadece transkript metnini döndür, başka açıklama ekleme.`,
                },
                { inline_data: { mime_type: mime, data: data.audio } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw { provider: "gemini", status: res.status, body } satisfies STTError;
      }
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
    }

    // OpenAI Whisper transcription — multipart upload.
    async function viaOpenAI(): Promise<string> {
      const ext = mime.includes("mp4")
        ? "mp4"
        : mime.includes("mpeg")
          ? "mp3"
          : mime.includes("wav")
            ? "wav"
            : mime.includes("ogg")
              ? "ogg"
              : "webm";
      const fd = new FormData();
      fd.append("file", new Blob([bin], { type: mime }), `recording.${ext}`);
      fd.append("model", "gpt-4o-mini-transcribe");
      if (data.language) fd.append("language", data.language);
      const res = await fetchWithRetry("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: fd,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw { provider: "openai", status: res.status, body } satisfies STTError;
      }
      const json = (await res.json()) as { text?: string };
      return (json.text ?? "").trim();
    }

    const order: Array<() => Promise<string>> = [];
    if (data.provider === "openai") {
      if (!openaiKey) throw new Error("OpenAI yapılandırılmamış — Ayarlar'dan kontrol et");
      order.push(viaOpenAI);
    } else if (data.provider === "gemini") {
      if (!geminiKey) throw new Error("Gemini yapılandırılmamış — Ayarlar'dan kontrol et");
      order.push(viaGemini);
    } else {
      if (geminiKey) order.push(viaGemini);
      if (openaiKey) order.push(viaOpenAI);
    }

    let lastErr: STTError | null = null;
    for (const attempt of order) {
      try {
        return { text: await attempt() };
      } catch (e) {
        const err = e as Partial<STTError>;
        if (typeof err.status === "number") {
          console.error(`[transcribe] ${err.provider} ${err.status}: ${(err.body ?? "").slice(0, 300)}`);
          lastErr = { provider: err.provider ?? "?", status: err.status, body: err.body ?? "" };
          // Fall through to the next provider only on transient/limit errors.
          if (!FALLBACK_STATUSES.has(err.status)) break;
        } else {
          throw e;
        }
      }
    }

    if (!lastErr) throw new Error("Transkript başarısız");
    if (lastErr.status === 429) {
      throw new Error(`AI çok yoğun (${lastErr.provider}) — birkaç saniye sonra tekrar dene`);
    }
    if (lastErr.status === 402) throw new Error("Kredi tükendi — Ayarlar'dan AI sağlayıcısını değiştir");
    if (lastErr.status === 401 || lastErr.status === 403)
      throw new Error("API anahtarı geçersiz — Ayarlar'dan kontrol et");
    throw new Error(`Transkript hatası (${lastErr.status}): ${lastErr.body.slice(0, 200)}`);
  });

function parseList(raw: string): string[] {
  // Try JSON first
  try {
    const obj = JSON.parse(raw) as unknown;
    if (Array.isArray(obj)) return obj.map(String).filter(Boolean);
    if (obj && typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      for (const k of ["items", "list", "ideas", "steps", "titles", "result"]) {
        const v = o[k];
        if (Array.isArray(v)) return v.map(String).filter(Boolean);
      }
    }
  } catch {
    /* fall through */
  }
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter((l) => l.length > 0 && l.length < 140)
    .slice(0, 12);
}

export const aiSuggestSubnodes = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator((data: { title: string; note?: string; count?: number }) => {
    if (!data.title) throw new Error("title gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const count = Math.min(Math.max(data.count ?? 5, 3), 8);
    const raw = await callAI(
      [
        {
          role: "system",
          content:
            "Sen bir mindmap asistanısın. Verilen düğüm için kısa, eyleme dönük alt fikir başlıkları üret. Türkçe yanıt ver. Sadece JSON döndür: {\"items\":[\"...\"]}.",
        },
        {
          role: "user",
          content: `Düğüm başlığı: ${data.title}\n${data.note ? `Not: ${data.note}\n` : ""}En fazla ${count} alt fikir üret. Her biri 2-5 kelime.`,
        },
      ],
      true,
    );
    return { items: parseList(raw).slice(0, count) };
  });

export const aiBreakdownTask = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator((data: { text: string; context?: string }) => {
    if (!data.text) throw new Error("text gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const raw = await callAI(
      [
        {
          role: "system",
          content:
            "Sen bir verimlilik koçusun. Bir görevi 3-6 net, sıralı, küçük adıma böl. Türkçe yanıt ver. Sadece JSON: {\"items\":[\"...\"]}.",
        },
        {
          role: "user",
          content: `${data.context ? `Bağlam: ${data.context}\n` : ""}Görev: ${data.text}\n3-6 adım üret. Her adım 2-7 kelime, fiil ile başlasın.`,
        },
      ],
      true,
    );
    return { items: parseList(raw).slice(0, 6) };
  });

export const aiSummarize = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator((data: { title?: string; note: string }) => {
    if (!data.note) throw new Error("note gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const raw = await callAI([
      {
        role: "system",
        content:
          "Türkçe, kısa ve net özetler yaz. Maddeler halinde 3-5 madde, her madde tek satır. Markdown listesi olarak döndür.",
      },
      {
        role: "user",
        content: `${data.title ? `Başlık: ${data.title}\n` : ""}Metin:\n${data.note}`,
      },
    ]);
    return { summary: raw };
  });

// ----- Phase 2: AI as main actor -----

function parseJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        /* noop */
      }
    }
    return null;
  }
}

/** Suggest 3–6 short Turkish tags for a piece of text. */
export const aiAutoTag = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator((data: { text: string; note?: string; existing?: string[] }) => {
    if (!data.text) throw new Error("text gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const raw = await callAI(
      [
        {
          role: "system",
          content:
            "Türkçe etiket önerirsin. 3-6 adet, tek kelime veya kısa (max 2 kelime), küçük harf, türkçe karakter olabilir. Mevcut etiketleri tekrar etme. Sadece JSON döndür: {\"items\":[\"...\"]}.",
        },
        {
          role: "user",
          content:
            `Başlık/metin: ${data.text}\n` +
            (data.note ? `Not: ${data.note}\n` : "") +
            (data.existing?.length ? `Mevcut: ${data.existing.join(", ")}\n` : "") +
            "Bu içeriği iyi tanımlayan kısa etiketler ver.",
        },
      ],
      true,
    );
    const cleaned = parseList(raw)
      .map((t) => t.replace(/^#/, "").trim().toLowerCase())
      .filter((t) => t && t.length <= 24 && !data.existing?.includes(t))
      .slice(0, 6);
    return { items: cleaned };
  });

/** Smart day planner — orders today's tasks and returns rationale per item. */
export const aiPlanDay = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator(
    (data: {
      items: Array<{
        id: string;
        text: string;
        dueAt?: number;
        starred?: boolean;
        estimateMin?: number;
        tags?: string[];
      }>;
      now?: number;
    }) => {
      if (!Array.isArray(data.items) || !data.items.length) throw new Error("items gerekli");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const now = data.now ?? Date.now();
    const list = data.items.map((i) => ({
      id: i.id,
      text: i.text,
      due: i.dueAt ? new Date(i.dueAt).toISOString() : undefined,
      starred: !!i.starred,
      estimate: i.estimateMin,
      tags: i.tags,
    }));
    const raw = await callAI(
      [
        {
          role: "system",
          content:
            "Sen bir verimlilik koçusun. Verilen görevleri bugün için optimal sıraya koy. Önce hızlı kazanımlar/odak gerektirenler sabaha, rutinler ve hafif işler öğleden sonraya. Acil ve önemli olanlar üstte. Sadece JSON döndür: {\"plan\":[{\"id\":\"...\",\"reason\":\"kısa türkçe gerekçe (max 10 kelime)\"}]} — tüm id'leri tek bir kez kullan.",
        },
        {
          role: "user",
          content:
            `Şimdi: ${new Date(now).toISOString()}\nGörevler:\n${JSON.stringify(list, null, 2)}`,
        },
      ],
      true,
    );
    const obj = parseJson<{ plan?: Array<{ id: string; reason?: string }> }>(raw);
    const plan = (obj?.plan ?? []).filter((p) => list.some((l) => l.id === p.id));
    // Ensure all items present
    const seen = new Set(plan.map((p) => p.id));
    list.forEach((l) => {
      if (!seen.has(l.id)) plan.push({ id: l.id, reason: "" });
    });
    return { plan };
  });

/** General-purpose chat. Stateless — caller sends full message history. */
export const aiChat = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator(
    (data: {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      context?: string;
    }) => {
      if (!Array.isArray(data.messages) || !data.messages.length) throw new Error("messages gerekli");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const sys: Msg = {
      role: "system",
      content:
        "Sen MintMap'in dahili yardımcısısın. Türkçe, kısa ve eyleme dönük yanıt ver. Kullanıcının mindmap düğümleri ve görevleri hakkında bağlam aldığında bunları referans gösterebilirsin. Madde işaretleri kullan, gereksiz uzun açıklamadan kaçın." +
        (data.context ? `\n\n[Çalışma alanı bağlamı]\n${data.context.slice(0, 4000)}` : ""),
    };
    const reply = await callAI([sys, ...data.messages]);
    return { reply };
  });

/** Quick capture: turn freeform note/voice transcript into a node + child suggestions. */
export const aiQuickCapture = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator((data: { text: string }) => {
    if (!data.text) throw new Error("text gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const raw = await callAI(
      [
        {
          role: "system",
          content:
            "Verilen serbest metni bir mindmap girdisine dönüştür. Türkçe. Sadece JSON: {\"title\":\"kısa başlık (max 6 kelime)\",\"summary\":\"1-2 cümle özet\",\"todos\":[\"eyleme dönük 2-5 görev\"],\"tags\":[\"2-4 kısa etiket\"]}.",
        },
        { role: "user", content: data.text },
      ],
      true,
    );
    const obj = parseJson<{ title?: string; summary?: string; todos?: string[]; tags?: string[] }>(raw);
    return {
      title: obj?.title?.trim() || data.text.slice(0, 40),
      summary: obj?.summary?.trim() ?? "",
      todos: (obj?.todos ?? []).map(String).filter(Boolean).slice(0, 6),
      tags: (obj?.tags ?? []).map((t) => String(t).replace(/^#/, "").toLowerCase()).filter(Boolean).slice(0, 4),
    };
  });

// ----- Tool-calling chat step (OpenAI-compatible) -----

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ChatStepMsg =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_node",
      description: "Mevcut bir düğümün altında yeni bir mindmap düğümü oluştur. Dönüş: { id, title }.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Düğüm başlığı (max 60 karakter)" },
          parentId: { type: "string", description: "Üst düğümün ID'si. Boş bırakılırsa workspace'in root düğümüne eklenir." },
          tags: { type: "array", items: { type: "string" }, description: "İsteğe bağlı etiketler" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Belirtilen düğüme bir görev (todo) ekle. Dönüş: { id }.",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string", description: "Görevin ekleneceği düğüm ID." },
          text: { type: "string", description: "Görev metni." },
          dueAtISO: { type: "string", description: "Bitiş tarihi (ISO 8601). İsteğe bağlı." },
          reminderAtISO: { type: "string", description: "Hatırlatma zamanı (ISO 8601). İsteğe bağlı." },
          starred: { type: "boolean" },
          myDay: { type: "boolean", description: "Günüm görünümüne eklensin mi." },
          tags: { type: "array", items: { type: "string" } },
          steps: { type: "array", items: { type: "string" }, description: "Alt adımlar." },
        },
        required: ["nodeId", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_subtasks",
      description: "Var olan bir göreve alt adımlar ekle.",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          taskId: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
        },
        required: ["nodeId", "taskId", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Bir görevi güncelle (tarih, etiket, önem, durum, günüm).",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          taskId: { type: "string" },
          dueAtISO: { type: "string" },
          reminderAtISO: { type: "string" },
          starred: { type: "boolean" },
          done: { type: "boolean" },
          myDay: { type: "boolean" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["nodeId", "taskId"],
      },
    },
  },
] as const;

export type AIToolCall = { id: string; name: string; arguments: string };
export type AIChatStepResult = {
  content: string;
  toolCalls: AIToolCall[];
  finishReason?: string;
};

/** Run one step of an AI chat with tool-calling enabled. Client executes tools, then sends tool results back. */
export const aiChatStep = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator((data: { messages: ChatStepMsg[]; context?: string; provider?: Provider; model?: string }) => {
    if (!Array.isArray(data.messages) || !data.messages.length) throw new Error("messages gerekli");
    return data;
  })
  .handler(async ({ data }): Promise<AIChatStepResult> => {
    const sys: ChatStepMsg = {
      role: "system",
      content:
        "Sen MintMap'in AI yardımcısısın. Türkçe, kısa ve net konuş.\n" +
        "Kullanıcı mindmap düğümleri ve görevleri hakkında yardım ister. " +
        "Görev/düğüm OLUŞTURMA veya GÜNCELLEME istendiğinde araçları kullan; sadece konuşmakla yetinme.\n" +
        "Önemli kurallar:\n" +
        "- Düğüm ve görev ID'lerini AŞAĞIDAKİ workspace bağlamından al; UYDURMA.\n" +
        "- Uygun bir üst düğüm yoksa önce create_node ile oluştur, sonra dönen id ile create_task çağır.\n" +
        "- Tarihler ISO 8601 (örn. 2026-06-25T09:00). Kullanıcı saat belirtmezse 09:00 kabul et.\n" +
        "- Birden çok araç çağrısını TEK BİR adımda paralel yap.\n" +
        "- Araç sonuçları geldikten sonra kullanıcıya kısa Türkçe özet ver." +
        (data.context ? `\n\n[Workspace bağlamı]\n${data.context.slice(0, 6000)}` : ""),
    };

    const res = await chatCompletion([sys, ...data.messages], {
      provider: data.provider,
      model: data.model,
      tools: CHAT_TOOLS,
      toolChoice: "auto",
    });
    return { content: res.content, toolCalls: res.toolCalls, finishReason: res.finishReason };
  });

/** Extract a structured task from a free-form voice transcript. Used for the preview/confirm UI. */
export const aiExtractVoiceTask = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator(
    (data: {
      transcript: string;
      now?: string;
      nodes?: Array<{ id: string; title: string; tags?: string[] }>;
      provider?: Provider;
      model?: string;
    }) => {
      if (!data.transcript) throw new Error("transcript gerekli");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const now = data.now || new Date().toISOString();
    const nodeList = (data.nodes ?? []).slice(0, 30);
    const raw = await callAI(
      [
        {
          role: "system",
          content:
            "Türkçe sesli notu yapılandırılmış bir göreve dönüştür. Tarih/saat ifadelerini (yarın, bu akşam, 9'da, 30 dakika sonra, salı 14:00) verilen 'şimdi' anına göre çöz. " +
            "Saat verilmemişse hatırlatma için 09:00 kabul et. Kullanıcı 'hatırlat' demese bile zaman bilgisi varsa reminderAtISO doldur. " +
            "Uygun düğümü mevcut düğümlerden seç (id ile); hiçbiri uymuyorsa suggestedNodeTitle ver. " +
            "Sadece JSON döndür: {\"text\":\"görev metni\",\"dueAtISO\":\"...\",\"reminderAtISO\":\"...\",\"nodeId\":\"...\",\"suggestedNodeTitle\":\"...\",\"tags\":[\"...\"],\"steps\":[\"...\"],\"starred\":false,\"myDay\":true}. " +
            "Bilinmeyen alanları boş bırak veya çıkar.",
        },
        {
          role: "user",
          content:
            `Şimdi: ${now}\n` +
            (nodeList.length
              ? `Mevcut düğümler:\n${nodeList
                  .map((n) => `- ${n.id} · ${n.title}${n.tags?.length ? ` #${n.tags.join(" #")}` : ""}`)
                  .join("\n")}\n`
              : "") +
            `Sesli not: "${data.transcript}"`,
        },
      ],
      true,
      { provider: data.provider, model: data.model },
    );
    const obj = parseJson<{
      text?: string;
      dueAtISO?: string;
      reminderAtISO?: string;
      nodeId?: string;
      suggestedNodeTitle?: string;
      tags?: unknown[];
      steps?: unknown[];
      starred?: boolean;
      myDay?: boolean;
    }>(raw);
    const nodeId = obj?.nodeId && nodeList.some((n) => n.id === obj.nodeId) ? obj.nodeId : undefined;
    return {
      text: (obj?.text ?? data.transcript).toString().trim(),
      dueAtISO: obj?.dueAtISO ? String(obj.dueAtISO) : undefined,
      reminderAtISO: obj?.reminderAtISO ? String(obj.reminderAtISO) : undefined,
      nodeId,
      suggestedNodeTitle: obj?.suggestedNodeTitle ? String(obj.suggestedNodeTitle).trim() : undefined,
      tags: Array.isArray(obj?.tags) ? obj!.tags.map((t) => String(t).replace(/^#/, "").toLowerCase().trim()).filter(Boolean).slice(0, 6) : [],
      steps: Array.isArray(obj?.steps) ? obj!.steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 8) : [],
      starred: !!obj?.starred,
      myDay: obj?.myDay !== false,
    };
  });


// ----- Bulk / reporting -----

type BulkNodeInput = {
  title: string;
  note?: string;
  todos?: Array<{ text: string; done?: boolean }>;
  tags?: string[];
};

/** Summarize an entire workspace (or arbitrary set) of nodes into themes + action items. */
export const aiBulkSummarize = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator(
    (data: {
      nodes: BulkNodeInput[];
      workspaceName?: string;
      provider?: Provider;
      model?: string;
    }) => {
      if (!Array.isArray(data.nodes) || !data.nodes.length) throw new Error("nodes gerekli");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const capped = data.nodes.slice(0, 400);
    const flat = capped
      .map((n, i) => {
        const todos = (n.todos ?? [])
          .slice(0, 10)
          .map((t) => `  ${t.done ? "[x]" : "[ ]"} ${t.text}`)
          .join("\n");
        const tags = n.tags?.length ? ` #${n.tags.join(" #")}` : "";
        return `${i + 1}. ${n.title}${tags}${n.note ? `\n  ${n.note.slice(0, 300)}` : ""}${todos ? `\n${todos}` : ""}`;
      })
      .join("\n");
    const reply = await callAI(
      [
        {
          role: "system",
          content:
            "Sen bir bilgi mimarısın. Verilen mindmap düğümlerini Türkçe olarak özetle. Şu markdown formatını kullan:\n" +
            "## Ana temalar\n- (3-6 tema, her biri tek satır)\n\n" +
            "## Öne çıkan projeler\n- (varsa 2-5 proje/hedef)\n\n" +
            "## Bekleyen aksiyonlar\n- (tamamlanmamış görevlerden 5-10 önemli olanı, [priority] ile)\n\n" +
            "## Önerilen sonraki adımlar\n- (2-4 net eylem)\n\n" +
            "Kısa ve net. Gereksiz süsleme yok.",
        },
        {
          role: "user",
          content:
            `${data.workspaceName ? `Çalışma alanı: ${data.workspaceName}\n` : ""}Toplam ${capped.length} düğüm:\n\n${flat}`,
        },
      ],
      false,
      { provider: data.provider, model: data.model },
    );
    return { markdown: reply, count: capped.length, truncated: data.nodes.length > 400 };
  });

type WeeklyInput = {
  workspaceName?: string;
  from: string;
  to: string;
  completed: Array<{ text: string; wsName: string; nodeTitle: string; completedAt: string }>;
  open: Array<{ text: string; wsName: string; nodeTitle: string; dueAt?: string; starred?: boolean }>;
  createdNodes: Array<{ title: string; wsName: string; createdAt: string }>;
  provider?: Provider;
  model?: string;
};

/** Generate a weekly retrospective / plan-ahead report from workspace activity. */
export const aiWeeklyReport = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator((data: WeeklyInput) => {
    if (!data.from || !data.to) throw new Error("tarih aralığı gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const completed = data.completed.slice(0, 80);
    const open = data.open.slice(0, 80);
    const created = data.createdNodes.slice(0, 60);
    const list = (arr: Array<Record<string, unknown>>, fmt: (x: Record<string, unknown>) => string) =>
      arr.length ? arr.map(fmt).join("\n") : "(yok)";

    const body =
      `Aralık: ${data.from} – ${data.to}\n` +
      `Tamamlanan görevler (${completed.length}):\n` +
      list(completed as Array<Record<string, unknown>>, (t) => `- [${t.wsName}] ${t.nodeTitle} · ${t.text}`) +
      `\n\nAçık görevler (${open.length}):\n` +
      list(open as Array<Record<string, unknown>>, (t) => {
        const due = t.dueAt ? ` (⏰ ${String(t.dueAt).slice(0, 16)})` : "";
        const star = t.starred ? " ⭐" : "";
        return `- [${t.wsName}] ${t.nodeTitle} · ${t.text}${due}${star}`;
      }) +
      `\n\nOluşturulan düğümler (${created.length}):\n` +
      list(created as Array<Record<string, unknown>>, (n) => `- [${n.wsName}] ${n.title}`);

    const reply = await callAI(
      [
        {
          role: "system",
          content:
            "Sen bir verimlilik koçusun. Kullanıcının haftalık aktivite dökümünden Türkçe bir markdown rapor yaz.\n" +
            "Şu bölümler olsun:\n" +
            "# Haftalık Özet ({tarih aralığı})\n" +
            "## Öne çıkanlar\n- (3-5 madde: neler başarıldı)\n" +
            "## İlerleme\n- (rakamlar + trendler, kısa)\n" +
            "## Riskler / Gecikenler\n- (bekleyen kritik görevler)\n" +
            "## Gelecek hafta odak\n- (3-5 net eylem önerisi)\n\n" +
            "Ton: yapıcı, motive edici, gerçekçi. Kısa madde işaretleri.",
        },
        { role: "user", content: body },
      ],
      false,
      { provider: data.provider, model: data.model },
    );
    return { markdown: reply, stats: { completed: completed.length, open: open.length, created: created.length } };
  });

// ----- Keep-style capture: AI categorization -----

/**
 * Categorize a captured card (note / link / image) into ONE short Turkish
 * category plus tags and a cleaned title. For images the picture itself is
 * attached so a vision-capable model (gpt-4o-mini / gemini) can read it.
 */
export const aiCategorizeCard = createServerFn({ method: "POST" }).middleware([requireAppAuth])
  .inputValidator(
    (data: {
      type: "note" | "link" | "image";
      text?: string;
      url?: string;
      title?: string;
      description?: string;
      image?: string; // data URL (image cards only)
      existing?: string[];
      provider?: Provider;
      model?: string;
    }) => {
      if (!data.type) throw new Error("type gerekli");
      if (data.type !== "image" && !data.text && !data.url && !data.title)
        throw new Error("içerik gerekli");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const sys =
      "Sen bir içerik düzenleyicisin. Verilen öğeyi TEK bir kısa Türkçe kategoriye ata.\n" +
      "Örnek kategoriler: Ekran görüntüleri, Siteler, Filmler & Diziler, Yatırım, Alışveriş, İlham, Okuma listesi, Yemek, Seyahat, Müzik, İş, Kişisel.\n" +
      "Mevcut kategorilerden biri uygunsa MUTLAKA onu kullan. Uygun yoksa yeni, kısa (1-2 kelime) bir kategori üret.\n" +
      "Ayrıca içeriği tanımlayan 2-4 kısa etiket ve kısa bir başlık (max 8 kelime) üret.\n" +
      'Sadece JSON döndür: {"category":"...","tags":["..."],"title":"..."}.';

    const parts: string[] = [];
    if (data.title) parts.push(`Başlık: ${data.title}`);
    if (data.url) parts.push(`URL: ${data.url}`);
    if (data.description) parts.push(`Açıklama: ${data.description}`);
    if (data.text) parts.push(`İçerik: ${data.text}`);
    if (data.existing?.length) parts.push(`Mevcut kategoriler: ${data.existing.join(", ")}`);
    const userText = parts.join("\n") || "(görsel içerik)";

    const isImage = data.type === "image" && !!data.image;
    const userContent = isImage
      ? [
          {
            type: "text",
            text:
              userText +
              "\nAşağıdaki görseli (muhtemelen bir ekran görüntüsü) incele ve neyle ilgili olduğuna göre kategorize et.",
          },
          { type: "image_url", image_url: { url: data.image } },
        ]
      : userText;

    // Vision responses can reject response_format=json_object on some models,
    // so only request JSON mode for pure-text items; parseJson still extracts
    // the object from a fenced/plain reply for images.
    const res = await chatCompletion(
      [
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ],
      { provider: data.provider, model: data.model, jsonMode: !isImage },
    );
    const raw = res.content;
    const obj = parseJson<{ category?: string; tags?: unknown[]; title?: string }>(raw);
    return {
      category: (obj?.category ?? "").toString().trim() || "Kategorisiz",
      tags: Array.isArray(obj?.tags)
        ? obj!.tags
            .map((t) => String(t).replace(/^#/, "").toLowerCase().trim())
            .filter(Boolean)
            .slice(0, 4)
        : [],
      title: obj?.title ? String(obj.title).trim().slice(0, 80) : undefined,
    };
  });

