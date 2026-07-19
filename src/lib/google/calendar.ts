// Google Calendar, called directly from the browser with a GIS access token
// (replaces the old Lovable connector server functions). Same call shapes as
// before ({ data }) so the sync orchestration and callers stay unchanged.
import { getAccessToken } from "./gauth";

const API = "https://www.googleapis.com/calendar/v3";
const TZ = "Europe/Istanbul";

async function gapi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
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

export async function calendarCreateEvent({
  data,
}: {
  data: { title: string; description?: string; startISO: string; endISO?: string };
}): Promise<{ id: string | null; htmlLink: string | null }> {
  if (!data.title) throw new Error("title gerekli");
  if (!data.startISO || isNaN(Date.parse(data.startISO))) throw new Error("Geçersiz başlangıç tarihi");
  const json = await gapi<{ id?: string; htmlLink?: string }>(`/calendars/primary/events`, {
    method: "POST",
    body: JSON.stringify(eventBody(data)),
  });
  return { id: json.id ?? null, htmlLink: json.htmlLink ?? null };
}

export async function calendarListUpcoming(): Promise<{
  items: Array<{ id: string; title: string; start: string | null; htmlLink: string | null }>;
}> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: "10",
    singleEvents: "true",
    orderBy: "startTime",
  });
  const json = await gapi<{
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      htmlLink?: string;
    }>;
  }>(`/calendars/primary/events?${params.toString()}`);
  return {
    items: (json.items ?? []).map((e) => ({
      id: e.id,
      title: e.summary ?? "(başlıksız)",
      start: e.start?.dateTime ?? e.start?.date ?? null,
      htmlLink: e.htmlLink ?? null,
    })),
  };
}

export type SyncTaskInput = {
  key: string; // local composite id, e.g. wsId:nodeId:todoId
  title: string;
  description?: string;
  startISO: string;
  endISO?: string;
  googleEventId?: string;
};

/** Push local tasks to Google Calendar. Creates missing events, PATCHes existing ones. */
export async function calendarSyncPush({
  data,
}: {
  data: { items: SyncTaskInput[] };
}): Promise<{
  results: Array<{ key: string; googleEventId: string; htmlLink?: string; error?: string }>;
}> {
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
        const json = await gapi<{ id?: string; htmlLink?: string }>(`/calendars/primary/events`, {
          method: "POST",
          body: JSON.stringify(eventBody(t)),
        });
        if (json.id) results.push({ key: t.key, googleEventId: json.id, htmlLink: json.htmlLink });
      }
    } catch (e) {
      results.push({ key: t.key, googleEventId: t.googleEventId ?? "", error: (e as Error).message });
    }
  }
  return { results };
}

/** Pull specific Google events back to detect updates/deletes. */
export async function calendarSyncPull({
  data,
}: {
  data: { eventIds: string[] };
}): Promise<{
  updates: Array<{
    googleEventId: string;
    status: "confirmed" | "cancelled" | "missing";
    startISO?: string;
    title?: string;
  }>;
}> {
  const updates: Array<{
    googleEventId: string;
    status: "confirmed" | "cancelled" | "missing";
    startISO?: string;
    title?: string;
  }> = [];
  const token = await getAccessToken();
  for (const id of data.eventIds.slice(0, 200)) {
    try {
      const res = await fetch(`${API}/calendars/primary/events/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
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
}

export async function calendarDeleteEvent({
  data,
}: {
  data: { eventId: string };
}): Promise<{ ok: true }> {
  if (!data.eventId) throw new Error("eventId gerekli");
  const token = await getAccessToken();
  const res = await fetch(`${API}/calendars/primary/events/${encodeURIComponent(data.eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => "");
    throw new Error(`Takvim silme hatası (${res.status}): ${text.slice(0, 200)}`);
  }
  return { ok: true };
}
