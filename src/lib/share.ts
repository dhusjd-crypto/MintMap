import { toast } from "sonner";

// Share OUT — opens the native OS share sheet (Web Share API) on Android / iOS
// and modern desktop. Falls back to clipboard copy or image download where the
// API (or file sharing) isn't available. Never throws to the caller.

function dataUrlToFile(dataUrl: string, name: string): File | null {
  try {
    const [head, b64] = dataUrl.split(",");
    if (!b64) return null;
    const mime = head.match(/data:([^;]+)/)?.[1] || "image/jpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const ext = (mime.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const safe = name.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 40) || "mintmap";
    return new File([arr], `${safe}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

export type ShareInput = {
  title?: string;
  text?: string;
  url?: string;
  imageDataUrl?: string;
};

export async function shareContent(input: ShareInput): Promise<void> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const data: ShareData = {};
  if (input.title) data.title = input.title;
  if (input.text) data.text = input.text;
  if (input.url) data.url = input.url;

  // Prefer sharing the image file itself when there is one.
  if (input.imageDataUrl && nav?.canShare) {
    const file = dataUrlToFile(input.imageDataUrl, input.title || "mintmap");
    if (file && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ ...data, files: [file] });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // user dismissed the sheet
      }
    }
  }

  // Text / link share via the native sheet.
  if (nav?.share && (data.title || data.text || data.url)) {
    try {
      await nav.share(data);
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }

  // Fallbacks (desktop / unsupported).
  const clip = [input.text, input.url].filter(Boolean).join("\n");
  if (clip && nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(clip);
      toast.success("Panoya kopyalandı");
      return;
    } catch {
      /* fall through */
    }
  }
  if (input.imageDataUrl && typeof document !== "undefined") {
    const a = document.createElement("a");
    a.href = input.imageDataUrl;
    a.download = (input.title || "mintmap").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 40) || "mintmap";
    a.click();
    toast.success("Görsel indirildi");
    return;
  }
  toast.error("Bu cihazda paylaşım desteklenmiyor");
}

/** True when the native share sheet is available (mobile mostly). */
export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}
