// Google Drive backup, called directly from the browser with a GIS access
// token (replaces the old Lovable connector server function). The snapshot is
// stored in the app's private appDataFolder, so the app only ever sees its own
// file — no broad Drive access.
import { getAccessToken } from "./gauth";
import { readBackupPayload, shouldAllowCloudSave } from "../backup-format";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FILE_NAME = "mintmap-data.json";

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...((init.headers as Record<string, string>) || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function findFileId(): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const r = await driveFetch(
    `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
  );
  const j = (await r.json()) as { files?: { id: string }[] };
  return j.files?.[0]?.id ?? null;
}

export async function driveSaveSnapshot({
  data,
}: {
  data: { json: string };
}): Promise<{ id: string; savedAt: number }> {
  const parsed = JSON.parse(data.json);
  const backup = readBackupPayload(parsed);
  if (backup.kind !== "full") {
    throw new Error(
      "Eski uygulama sürümü tek çalışma alanı yedeklemeye çalıştı. Sayfayı tamamen yenileyip tekrar buluta yedekle.",
    );
  }
  if (!shouldAllowCloudSave(backup.store)) {
    throw new Error(
      "Varsayılan boş veri buluta yazılmadı. Önce buluttan geri yükle veya telefondaki dolu veriden yedek al.",
    );
  }
  const json = JSON.stringify(backup.store);
  const existing = await findFileId();
  const metadata = existing ? {} : { name: FILE_NAME, parents: ["appDataFolder"] };
  const boundary = "----mintmap" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;
  const url = existing
    ? `${UPLOAD}/files/${existing}?uploadType=multipart`
    : `${UPLOAD}/files?uploadType=multipart`;
  const r = await driveFetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = (await r.json()) as { id: string };
  return { id: j.id, savedAt: Date.now() };
}

export async function driveLoadSnapshot(): Promise<{ json: string | null }> {
  const id = await findFileId();
  if (!id) return { json: null };
  const r = await driveFetch(`${API}/files/${id}?alt=media`);
  return { json: await r.text() };
}
