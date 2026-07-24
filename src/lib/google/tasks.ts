import { getAccessToken } from "./gauth";

const API = "https://tasks.googleapis.com/tasks/v1";
export const MINTMAP_TASK_LIST_TITLE = "MintMap";

type GoogleTask = { id?: string };
type GoogleTaskList = { id?: string; title?: string };
type GoogleTaskRemote = { id?: string; status?: "needsAction" | "completed"; deleted?: boolean };

export type GoogleTaskInput = {
  key: string;
  title: string;
  description?: string;
  dueAt?: number;
  done?: boolean;
  googleTaskId?: string;
  googleTaskListId?: string;
};

export function toGoogleTaskBody(task: GoogleTaskInput) {
  return {
    title: task.title,
    notes: task.description ?? "",
    ...(task.dueAt ? { due: new Date(task.dueAt).toISOString() } : {}),
    ...(task.done ? { status: "completed" } : { status: "needsAction" }),
  };
}

export function googleTaskRemoteStatus(task: GoogleTaskRemote): "needsAction" | "completed" | "missing" {
  if (task.deleted) return "missing";
  return task.status === "completed" ? "completed" : "needsAction";
}

async function tasksFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error(`Google Tasks hatası (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function getMintMapListId(): Promise<string> {
  const listed = await tasksFetch<{ items?: GoogleTaskList[] }>("/users/@me/lists?maxResults=100");
  const existing = listed.items?.find((list) => list.title === MINTMAP_TASK_LIST_TITLE)?.id;
  if (existing) return existing;
  const created = await tasksFetch<GoogleTaskList>("/users/@me/lists", {
    method: "POST",
    body: JSON.stringify({ title: MINTMAP_TASK_LIST_TITLE }),
  });
  if (!created.id) throw new Error("Google Tasks listesi oluşturulamadı");
  return created.id;
}

/** Creates or updates tasks only in MintMap's dedicated Google Tasks list. */
export async function googleTasksSyncPush({
  data,
}: {
  data: { items: GoogleTaskInput[] };
}): Promise<{
  listId: string;
  results: Array<{ key: string; googleTaskId: string; error?: string }>;
}> {
  const listId = await getMintMapListId();
  const results: Array<{ key: string; googleTaskId: string; error?: string }> = [];
  for (const task of data.items) {
    try {
      const id = task.googleTaskListId === listId ? task.googleTaskId : undefined;
      const path = id
        ? `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`
        : `/lists/${encodeURIComponent(listId)}/tasks`;
      const json = await tasksFetch<GoogleTask>(path, {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(toGoogleTaskBody(task)),
      });
      if (!json.id) throw new Error("Google Tasks görev kimliği dönmedi");
      results.push({ key: task.key, googleTaskId: json.id });
    } catch (error) {
      results.push({ key: task.key, googleTaskId: task.googleTaskId ?? "", error: (error as Error).message });
    }
  }
  return { listId, results };
}

/** Reads the state of MintMap-linked Google Tasks without touching other lists. */
export async function googleTasksSyncPull({
  data,
}: {
  data: { listId: string; taskIds: string[] };
}): Promise<{
  updates: Array<{ googleTaskId: string; status: "needsAction" | "completed" | "missing" }>;
}> {
  const updates: Array<{ googleTaskId: string; status: "needsAction" | "completed" | "missing" }> = [];
  for (const taskId of data.taskIds.slice(0, 200)) {
    try {
      const task = await tasksFetch<GoogleTaskRemote>(
        `/lists/${encodeURIComponent(data.listId)}/tasks/${encodeURIComponent(taskId)}`,
      );
      updates.push({ googleTaskId: taskId, status: googleTaskRemoteStatus(task) });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("(404)")) updates.push({ googleTaskId: taskId, status: "missing" });
    }
  }
  return { updates };
}
