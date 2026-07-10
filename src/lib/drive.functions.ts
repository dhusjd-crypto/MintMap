import { createServerFn } from "@tanstack/react-start";
import { readBackupPayload, shouldAllowCloudSave } from "./backup-format";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const FILE_NAME = "mintmap-data.json";

async function gw(path: string, init: RequestInit = {}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Drive bağlantısı yapılandırılmamış");
  }
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function findFileId(): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const r = await gw(
    `/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
  );
  const j = (await r.json()) as { files?: { id: string }[] };
  return j.files?.[0]?.id ?? null;
}

export const driveSaveSnapshot = createServerFn({ method: "POST" })
  .inputValidator((d: { json: string }) => d)
  .handler(async ({ data }) => {
    const parsed = JSON.parse(data.json);
    const backup = readBackupPayload(parsed);
    if (backup.kind !== "full") {
      throw new Error("Eski uygulama sürümü tek çalışma alanı yedeklemeye çalıştı. Sayfayı tamamen yenileyip tekrar buluta yedekle.");
    }
    if (!shouldAllowCloudSave(backup.store)) {
      throw new Error("Varsayılan boş veri buluta yazılmadı. Önce buluttan geri yükle veya telefondaki dolu veriden yedek al.");
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
    const path = existing
      ? `/upload/drive/v3/files/${existing}?uploadType=multipart`
      : `/upload/drive/v3/files?uploadType=multipart`;
    const r = await gw(path, {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const j = (await r.json()) as { id: string };
    return { id: j.id, savedAt: Date.now() };
  });

export const driveLoadSnapshot = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = await findFileId();
    if (!id) return { json: null as string | null };
    const r = await gw(`/drive/v3/files/${id}?alt=media`);
    return { json: await r.text() };
  },
);
