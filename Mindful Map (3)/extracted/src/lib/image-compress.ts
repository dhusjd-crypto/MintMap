import type { CompressRequest, CompressResponse } from "./image-worker";

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<string, (r: CompressResponse) => void>();

function supported() {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

function getWorker(): Worker | null {
  if (!supported()) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./image-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (e: MessageEvent<CompressResponse>) => {
      const cb = pending.get(e.data.id);
      if (!cb) return;
      pending.delete(e.data.id);
      cb(e.data);
    });
  } catch {
    worker = null;
  }
  return worker;
}

async function fallback(file: File, maxDim: number, quality: number): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = raw;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const area = img.naturalWidth * img.naturalHeight;
    const areaCap = 2_400_000;
    if (longest <= maxDim && area <= areaCap && file.size < 400_000) return raw;
    const dimScale = Math.min(1, maxDim / longest);
    const areaScale = area > areaCap ? Math.sqrt(areaCap / area) : 1;
    const scale = Math.min(dimScale, areaScale);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    // canvas.toDataURL doesn't reliably support webp on all engines; JPEG is safe.
    return c.toDataURL("image/jpeg", quality);
  } catch {
    return raw;
  }
}

export type ProgressEvent = {
  index: number; // 1-based
  total: number;
  file: File;
};

/**
 * Compresses an array of image files off the main thread. Emits a progress
 * callback after each completion. Falls back to the main thread when the
 * Worker / OffscreenCanvas APIs are missing.
 */
export async function compressImages(
  files: File[],
  opts: {
    maxDim?: number;
    quality?: number;
    onProgress?: (p: ProgressEvent) => void;
    concurrency?: number;
  } = {},
): Promise<string[]> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.78;
  const w = getWorker();
  const out: string[] = new Array(files.length);

  // Bounded parallelism — the worker can interleave decodes/encodes while one
  // is awaiting OffscreenCanvas.convertToBlob, so >1 concurrent task is a
  // real throughput win even with a single worker. Stay conservative to
  // avoid stalling the UI when the worker is busy.
  const hw =
    typeof navigator !== "undefined" && (navigator as Navigator).hardwareConcurrency
      ? (navigator as Navigator).hardwareConcurrency
      : 2;
  const limit = Math.max(
    1,
    Math.min(opts.concurrency ?? Math.min(3, Math.max(1, Math.floor(hw / 2))), files.length),
  );

  let next = 0;
  let done = 0;
  const runOne = async (i: number): Promise<void> => {
    const file = files[i];
    let dataUrl: string;
    if (w) {
      const id = String(++nextId);
      const req: CompressRequest = { id, file, maxDim, quality };
      dataUrl = await new Promise<string>((resolve) => {
        pending.set(id, (res) => {
          if (res.ok) resolve(res.dataUrl);
          else fallback(file, maxDim, quality).then(resolve);
        });
        w.postMessage(req);
      });
    } else {
      dataUrl = await fallback(file, maxDim, quality);
    }
    out[i] = dataUrl;
    done++;
    opts.onProgress?.({ index: done, total: files.length, file });
  };

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= files.length) return;
      await runOne(i);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

