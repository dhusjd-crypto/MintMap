/// <reference lib="webworker" />
// Background image compressor — runs in a Web Worker so big uploads don't
// freeze the UI. Uses OffscreenCanvas + createImageBitmap when available.

export type CompressRequest = {
  id: string;
  file: File;
  maxDim: number;
  quality: number;
};

export type CompressResponse =
  | { id: string; ok: true; dataUrl: string; width: number; height: number; bytes: number }
  | { id: string; ok: false; error: string };

function blobToDataUrl(blob: Blob, type: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(new Blob([blob], { type }));
  });
}

async function tryEncode(
  canvas: OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob | null> {
  try {
    const blob = await canvas.convertToBlob({ type, quality });
    return blob.type === type ? blob : null;
  } catch {
    return null;
  }
}

async function compress({ file, maxDim, quality }: CompressRequest) {
  const bmp = await createImageBitmap(file);
  const longest = Math.max(bmp.width, bmp.height);
  // Cap by longest dim AND by total pixel area (~2.4 MP) so panoramic
  // images don't sneak through with one tiny dimension.
  const dimScale = Math.min(1, maxDim / longest);
  const areaCap = 2_400_000;
  const area = bmp.width * bmp.height;
  const areaScale = area > areaCap ? Math.sqrt(areaCap / area) : 1;
  const scale = Math.min(dimScale, areaScale);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  // Skip re-encode if it's already small and not huge in bytes.
  if (scale === 1 && file.size < 400_000) {
    const dataUrl = await blobToDataUrl(file, file.type || "image/jpeg");
    bmp.close();
    return { dataUrl, width: w, height: h, bytes: file.size };
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  // Prefer WebP (~25-35% smaller than JPEG at similar quality); fall back to JPEG.
  const webp = await tryEncode(canvas, "image/webp", quality);
  const blob = webp ?? (await canvas.convertToBlob({ type: "image/jpeg", quality }));
  const dataUrl = await blobToDataUrl(blob, blob.type);
  return { dataUrl, width: w, height: h, bytes: blob.size };
}

self.addEventListener("message", async (e: MessageEvent<CompressRequest>) => {
  const req = e.data;
  try {
    const out = await compress(req);
    const res: CompressResponse = { id: req.id, ok: true, ...out };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: CompressResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  }
});
