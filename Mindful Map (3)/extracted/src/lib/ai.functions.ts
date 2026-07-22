import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENAI = "https://api.openai.com/v1/chat/completions";
const GATEWAY_MODEL = "google/gemini-2.5-flash";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

type Provider = "gateway" | "openai";
type Msg = { role: "system" | "user" | "assistant"; content: string };

const FALLBACK_STATUSES = new Set([401, 402, 429, 500, 502, 503, 504]);

function modelForProvider(provider: Provider, model?: string): string {
  if (provider === "openai") return model && !model.includes("/") ? model : OPENAI_DEFAULT_MODEL;
  return model?.startsWith("google/") ? model : GATEWAY_MODEL;
}

function resolveProviderOrder(pref?: Provider): Provider[] {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGateway = !!process.env.LOVABLE_API_KEY;

  // Explicit user preference → use ONLY that provider, no auto-fallback.
  if (pref === "openai") return hasOpenAI ? ["openai"] : [];
  if (pref === "gateway") return hasGateway ? ["gateway"] : [];

  // No preference (auto): try OpenAI first, then Lovable AI as fallback.
  return [hasOpenAI ? "openai" : undefined, hasGateway ? "gateway" : undefined].filter(
    Boolean,
  ) as Provider[];
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

async function chatCompletion(
  messages: unknown[],
  opts: {
    provider?: Provider;
    model?: string;
    jsonMode?: boolean;
    tools?: unknown;
    toolChoice?: unknown;
  } = {},
): Promise<Response> {
  const providers = resolveProviderOrder(opts.provider);
  if (!providers.length) throw new Error("Hiçbir AI sağlayıcı yapılandırılmamış");

  let lastRes: Response | null = null;
  for (const provider of providers) {
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY yapılandırılmamış");
      const res = await fetchWithRetry(OPENAI, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelForProvider("openai", opts.model),
          messages,
          ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
          ...(opts.tools ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto" } : {}),
        }),
      });
      if (res.ok || !FALLBACK_STATUSES.has(res.status)) return res;
      const body = await res
        .clone()
        .text()
        .catch(() => "");
      console.error(
        `[ai] openai ${res.status}, Lovable AI fallback deneniyor: ${body.slice(0, 300)}`,
      );
      lastRes = res;
      continue;
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY yapılandırılmamış");
    const res = await fetchWithRetry(GATEWAY, {
      method: "POST",
      headers: {
        "Lovable-API-Key": key,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "raw",
      },
      body: JSON.stringify({
        model: modelForProvider("gateway", opts.model),
        messages,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...(opts.tools ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto" } : {}),
      }),
    });
    if (res.ok || !FALLBACK_STATUSES.has(res.status)) return res;
    lastRes = res;
  }

  return lastRes ?? new Response("AI isteği başarısız", { status: 500 });
}

async function callAI(
  messages: Msg[],
  jsonMode = false,
  opts: { provider?: Provider; model?: string } = {},
): Promise<string> {
  const res = await chatCompletion(messages, { ...opts, jsonMode });
  if (res.status === 429) throw new Error("AI hız limiti — biraz sonra dene");
  if (res.status === 402) throw new Error("AI kredisi tükendi");
  if (res.status === 401) throw new Error("API anahtarı geçersiz — Ayarlar'dan kontrol et");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI hatası (${res.status}): ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Returns which providers are configured server-side. Safe to expose. */
export const aiStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    openai: !!process.env.OPENAI_API_KEY,
    gateway: !!process.env.LOVABLE_API_KEY,
  };
});

/** Transcribe an audio recording. Uses OpenAI if key present, else Lovable Gateway STT. */
export const aiTranscribe = createServerFn({ method: "POST" })
  .inputValidator((data: { audio: string; mime?: string; language?: string; provider?: Provider }) => {
    if (!data.audio) throw new Error("audio gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const bin = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    if (bin.byteLength < 1024) throw new Error("Kayıt çok kısa — tekrar dene");
    const mime = data.mime || "audio/webm";
    const ext = mime.includes("mp4")
      ? "mp4"
      : mime.includes("mpeg")
        ? "mp3"
        : mime.includes("wav")
          ? "wav"
          : mime.includes("ogg")
            ? "ogg"
            : "webm";

    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasGateway = !!process.env.LOVABLE_API_KEY;
    if (!hasOpenAI && !hasGateway) throw new Error("Hiçbir AI sağlayıcı yapılandırılmamış");

    type Attempt = { name: "openai" | "gateway"; url: string; headers: HeadersInit; model: string };
    const mkOpenAI = (): Attempt => ({
      name: "openai",
      url: "https://api.openai.com/v1/audio/transcriptions",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      model: "gpt-4o-mini-transcribe",
    });
    const mkGateway = (): Attempt => ({
      name: "gateway",
      url: "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
      headers: {
        "Lovable-API-Key": process.env.LOVABLE_API_KEY!,
        "X-Lovable-AIG-SDK": "raw",
      },
      model: "openai/gpt-4o-mini-transcribe",
    });

    // Respect user preference strictly — no auto-fallback when explicit.
    const attempts: Attempt[] = [];
    if (data.provider === "openai") {
      if (!hasOpenAI) throw new Error("OpenAI yapılandırılmamış — Ayarlar'dan kontrol et");
      attempts.push(mkOpenAI());
    } else if (data.provider === "gateway") {
      if (!hasGateway) throw new Error("Lovable AI yapılandırılmamış");
      attempts.push(mkGateway());
    } else {
      if (hasOpenAI) attempts.push(mkOpenAI());
      if (hasGateway) attempts.push(mkGateway());
    }

    let lastErr: { provider: string; status: number; body: string } | null = null;
    for (const a of attempts) {
      const fd = new FormData();
      fd.append("file", new Blob([bin], { type: mime }), `recording.${ext}`);
      fd.append("model", a.model);
      if (data.language) fd.append("language", data.language);

      const res = await fetchWithRetry(a.url, {
        method: "POST",
        headers: a.headers,
        body: fd,
      });
      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        return { text: (json.text ?? "").trim() };
      }
      const body = await res.text().catch(() => "");
      console.error(`[transcribe] ${a.name} ${res.status}: ${body.slice(0, 300)}`);
      lastErr = { provider: a.name, status: res.status, body };
      // try the next provider on transient/limit errors (only when no explicit pref)
      if (!FALLBACK_STATUSES.has(res.status)) break;
    }

    if (!lastErr) throw new Error("Transkript başarısız");
    if (lastErr.status === 429) {
      throw new Error(`AI çok yoğun (${lastErr.provider}) — birkaç saniye sonra tekrar dene`);
    }
    if (lastErr.status === 402) throw new Error("Kredi tükendi — Ayarlar'dan AI sağlayıcısını değiştir");
    if (lastErr.status === 401) throw new Error("API anahtarı geçersiz — Ayarlar'dan kontrol et");
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

export const aiSuggestSubnodes = createServerFn({ method: "POST" })
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

export const aiBreakdownTask = createServerFn({ method: "POST" })
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

export const aiSummarize = createServerFn({ method: "POST" })
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
export const aiAutoTag = createServerFn({ method: "POST" })
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
export const aiPlanDay = createServerFn({ method: "POST" })
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
export const aiChat = createServerFn({ method: "POST" })
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
export const aiQuickCapture = createServerFn({ method: "POST" })
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
export const aiChatStep = createServerFn({ method: "POST" })
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
    if (res.status === 429) throw new Error("AI hız limiti — biraz sonra dene");
    if (res.status === 402) throw new Error("AI kredisi tükendi");
    if (res.status === 401) throw new Error("API anahtarı geçersiz — Ayarlar'dan kontrol et");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI hatası (${res.status}): ${t.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string | null; tool_calls?: ToolCall[] };
      }>;
    };
    const choice = json.choices?.[0];
    const msg = choice?.message;
    return {
      content: (msg?.content ?? "").toString(),
      toolCalls: (msg?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments ?? "{}",
      })),
      finishReason: choice?.finish_reason,
    };
  });

/** Extract a structured task from a free-form voice transcript. Used for the preview/confirm UI. */
export const aiExtractVoiceTask = createServerFn({ method: "POST" })
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
export const aiBulkSummarize = createServerFn({ method: "POST" })
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
export const aiWeeklyReport = createServerFn({ method: "POST" })
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

