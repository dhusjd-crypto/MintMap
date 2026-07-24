import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type D1Statement = { bind: (...values: unknown[]) => D1Statement; first: <T>() => Promise<T | null> };
type D1Database = { prepare: (query: string) => D1Statement };

type WorkerBindings = {
  MINTMAP_SYNC?: D1Database;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
};

type SyncRow = { payload: string };

function syncDatabase(bindings?: WorkerBindings) {
  const runtime = globalThis as typeof globalThis & { __env__?: WorkerBindings };
  return bindings?.MINTMAP_SYNC ?? runtime.__env__?.MINTMAP_SYNC;
}

declare global {
  // Server functions run behind this Worker entry. Retain the current request's
  // bindings so their module graph can use D1 without exposing it to the client.
  // Cloudflare reuses the same immutable binding object for a deployment.
  // eslint-disable-next-line no-var
  var __mintmapWorkerBindings: WorkerBindings | undefined;
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function recoveryPage(payload: string | null) {
  const snapshot = payload ? JSON.parse(payload) as { mindmap?: unknown } : null;
  const store = JSON.stringify(JSON.stringify(snapshot?.mindmap ?? null)).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MintMap eşitleme</title><body><script>
    const cloudStore = ${store};
    if (cloudStore && JSON.parse(cloudStore)?.workspaces?.length) {
      localStorage.setItem("mindgrove.v2", cloudStore);
      location.replace("/?cloud-recovered=1");
    } else {
      document.body.textContent = "Bulut kopyası bulunamadı.";
    }
  </script></body></html>`;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const bindings = env as WorkerBindings | undefined;
      globalThis.__mintmapWorkerBindings = bindings;

      // A deterministic, one-time repair path for an installed PWA whose
      // local snapshot predates cloud sync. It runs before the app bundle and
      // therefore works even if that bundle is stale.
      if (new URL(request.url).pathname === "/sync-recover") {
        try {
          // Nitro installs __env__ while dispatching the first request. The
          // generated Worker wrapper does not pass its env object directly to
          // this custom entry, so initialise Nitro before reading D1.
          const handler = await getServerEntry();
          await handler.fetch(request, env, ctx);
          const database = syncDatabase(bindings);
          const row = database
            ? await database.prepare("SELECT payload FROM sync_documents WHERE id = ?").bind("personal").first<SyncRow>()
            : null;
          return new Response(recoveryPage(row?.payload ?? null), {
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown recovery error";
          return new Response(`MintMap recovery error: ${message}`, { status: 500, headers: { "cache-control": "no-store" } });
        }
      }

      // The site has an edge cache rule that can retain /sw.js across Worker
      // deployments. Read it through the versioned Worker asset binding and
      // mark it uncacheable so installed clients always receive the current
      // application/sync code on their next update check.
      if (new URL(request.url).pathname === "/sw.js" && bindings?.ASSETS) {
        const asset = await bindings.ASSETS.fetch(request);
        const headers = new Headers(asset.headers);
        headers.set("Cache-Control", "no-store, max-age=0");
        return new Response(asset.body, { status: asset.status, headers });
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
