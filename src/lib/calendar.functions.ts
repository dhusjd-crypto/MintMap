import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const TZ = "Europe/Istanbul";

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Google Calendar bağlantısı yapılandırılmamış");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

async function gapi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Takvim hatası (${res.status}): ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

function eventBody(t: { title: string; description?: string; startISO: string; endISO?: string }) {
  const start = new Date(t.startISO);
  const end = t.endISO ? new Date(t.endISO) : new Date(start.getTime() + 30 * 60_000);
  return {
    summary: t.title,
    description: t.description ?? "",
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
  };
}

export const calendarCreateEvent = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { title: string; description?: string; startISO: string; endISO?: string }) => {
      if (!data.title || typeof data.title !== "string") throw new Error("title gerekli");
      if (!data.startISO || isNaN(Date.parse(data.startISO))) throw new Error("Geçersiz başlangıç tarihi");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const json = await gapi<{ id?: string; htmlLink?: string }>(
      `/calendars/primary/events`,
      { method: "POST", body: JSON.stringify(eventBody(data)) },
    );
    return { id: json.id ?? null, htmlLink: json.htmlLink ?? null };
  });

export const calendarListUpcoming = createServerFn({ method: "GET" }).handler(async () => {
  const url = new URL(`${GATEWAY}/calendars/primary/events`);
  url.searchParams.set("timeMin", new Date().toISOString());
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Takvim hatası (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      htmlLink?: string;
    }>;
  };
  return {
    items: (json.items ?? []).map((e) => ({
      id: e.id,
      title: e.summary ?? "(başlıksız)",
      start: e.start?.dateTime ?? e.start?.date ?? null,
      htmlLink: e.htmlLink ?? null,
    })),
  };
});

// ----- Two-way sync -----

export type SyncTaskInput = {
  key: string; // local composite id, e.g. wsId:nodeId:todoId
  title: string;
  description?: string;
  startISO: string;
  endISO?: string;
  googleEventId?: string;
};

/** Push local tasks to Google Calendar. Creates missing events, PATCHes existing ones. */
export const calendarSyncPush = createServerFn({ method: "POST" })
  .inputValidator((data: { items: SyncTaskInput[] }) => {
    if (!Array.isArray(data.items)) throw new Error("items gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const results: Array<{ key: string; googleEventId: string; htmlLink?: string; error?: string }> = [];
    for (const t of data.items) {
      if (!t.startISO || isNaN(Date.parse(t.startISO))) continue;
      try {
        if (t.googleEventId) {
          const json = await gapi<{ id?: string; htmlLink?: string }>(
            `/calendars/primary/events/${encodeURIComponent(t.googleEventId)}`,
            { method: "PATCH", body: JSON.stringify(eventBody(t)) },
          );
          results.push({ key: t.key, googleEventId: json.id ?? t.googleEventId, htmlLink: json.htmlLink });
        } else {
          const json = await gapi<{ id?: string; htmlLink?: string }>(
            `/calendars/primary/events`,
            { method: "POST", body: JSON.stringify(eventBody(t)) },
          );
          if (json.id) results.push({ key: t.key, googleEventId: json.id, htmlLink: json.htmlLink });
        }
      } catch (e) {
        results.push({ key: t.key, googleEventId: t.googleEventId ?? "", error: (e as Error).message });
      }
    }
    return { results };
  });

/** Pull specific Google events back to detect updates/deletes. */
export const calendarSyncPull = createServerFn({ method: "POST" })
  .inputValidator((data: { eventIds: string[] }) => {
    if (!Array.isArray(data.eventIds)) throw new Error("eventIds gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const updates: Array<{
      googleEventId: string;
      status: "confirmed" | "cancelled" | "missing";
      startISO?: string;
      title?: string;
    }> = [];
    for (const id of data.eventIds.slice(0, 200)) {
      try {
        const res = await fetch(`${GATEWAY}/calendars/primary/events/${encodeURIComponent(id)}`, {
          headers: authHeaders(),
        });
        if (res.status === 404 || res.status === 410) {
          updates.push({ googleEventId: id, status: "missing" });
          continue;
        }
        if (!res.ok) continue;
        const ev = (await res.json()) as {
          id?: string;
          status?: string;
          summary?: string;
          start?: { dateTime?: string; date?: string };
        };
        updates.push({
          googleEventId: id,
          status: ev.status === "cancelled" ? "cancelled" : "confirmed",
          startISO: ev.start?.dateTime ?? ev.start?.date ?? undefined,
          title: ev.summary ?? undefined,
        });
      } catch {
        /* skip */
      }
    }
    return { updates };
  });

export const calendarDeleteEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string }) => {
    if (!data.eventId) throw new Error("eventId gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY}/calendars/primary/events/${encodeURIComponent(data.eventId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const text = await res.text().catch(() => "");
      throw new Error(`Takvim silme hatası (${res.status}): ${text.slice(0, 200)}`);
    }
    return { ok: true };
  });
