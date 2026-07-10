/**
 * Lazy PDF page renderer powered by pdfjs-dist. Used only client-side
 * inside the share-inbox preview. Worker is configured via Vite ?url import.
 */

type RenderedPage = { url: string; blob: Blob; width: number; height: number };

let pdfjsModule: typeof import("pdfjs-dist") | null = null;

async function loadPdfjs() {
  if (pdfjsModule) return pdfjsModule;
  const [mod, workerSrc] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  mod.GlobalWorkerOptions.workerSrc = workerSrc.default;
  pdfjsModule = mod;
  return mod;
}

export type PdfRenderResult = {
  pageCount: number;
  pages: RenderedPage[]; // up to opts.maxPages
};

export async function renderPdf(
  file: File | Blob,
  opts: { maxPages?: number; scale?: number; concurrency?: number } = {},
): Promise<PdfRenderResult> {
  const maxPages = opts.maxPages ?? 8;
  const scale = opts.scale ?? 1.25;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 2, maxPages));
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const total = Math.min(doc.numPages, maxPages);
  const pages: RenderedPage[] = new Array(total);

  let next = 1;
  const renderOne = async (i: number) => {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.85,
      ),
    );
    pages[i - 1] = {
      url: URL.createObjectURL(blob),
      blob,
      width: canvas.width,
      height: canvas.height,
    };
    // Release page + canvas memory promptly.
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  };
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i > total) return;
      await renderOne(i);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { pageCount: doc.numPages, pages: pages.filter(Boolean) };
}


/** Convert all rendered pages into image File objects for the upload queue. */
export function pagesToFiles(baseName: string, pages: RenderedPage[]): File[] {
  const stem = baseName.replace(/\.pdf$/i, "");
  return pages.map(
    (p, i) =>
      new File([p.blob], `${stem}-page-${String(i + 1).padStart(2, "0")}.jpg`, {
        type: "image/jpeg",
      }),
  );
}
