// MintMap service worker — minimal offline shell + runtime cache + Web Share Target.
// Bump CACHE whenever logic here changes so installed PWAs roll forward.
const CACHE = "mintmap-v10";
const SHELL = ["/", "/share-inbox", "/manifest.json", "/manifest.webmanifest"];
const SHARE_DB = "mintmap-share";
const SHARE_STORE = "inbox";
const DEBUG_STORE = "debug";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        // Individual put() so a single 404 (e.g. /share-inbox not yet built) doesn't fail the whole install.
        Promise.all(
          SHELL.map((url) =>
            fetch(url, { cache: "no-cache" })
              .then((res) => (res.ok ? c.put(url, res) : null))
              .catch(() => null),
          ),
        ),
      )
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function openShareDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(SHARE_DB, 4);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(SHARE_STORE)) {
        db.createObjectStore(SHARE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("defaults")) {
        db.createObjectStore("defaults", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("history")) {
        const os = db.createObjectStore("history", { keyPath: "id" });
        os.createIndex("at", "at", { unique: false });
      }
      if (!db.objectStoreNames.contains(DEBUG_STORE)) {
        const os = db.createObjectStore(DEBUG_STORE, { keyPath: "id" });
        os.createIndex("at", "at", { unique: false });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function paramsObject(searchParams) {
  const out = {};
  for (const [key, value] of searchParams.entries()) out[key] = value;
  return out;
}

function safeString(value, limit = 600) {
  const str = value == null ? "" : String(value);
  return str.length > limit ? `${str.slice(0, limit)}…` : str;
}

async function saveDebug(entry) {
  try {
    const db = await openShareDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DEBUG_STORE, "readwrite");
      tx.objectStore(DEBUG_STORE).put(entry);
      const trim = tx.objectStore(DEBUG_STORE).index("at").openCursor(null, "prev");
      let kept = 0;
      trim.onsuccess = () => {
        const cur = trim.result;
        if (!cur) return;
        kept += 1;
        if (kept > 30) cur.delete();
        cur.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Debug logging must never block the share redirect.
  }
}

async function saveShared(files, meta) {
  const db = await openShareDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, "readwrite");
    const store = tx.objectStore(SHARE_STORE);
    for (const f of files) {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      store.put({
        id,
        name: f.name || "shared-image",
        type: f.type || "image/*",
        size: f.size || 0,
        file: f,
        meta,
        at: Date.now(),
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function readDefaults() {
  try {
    const db = await openShareDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("defaults", "readonly");
      const req = tx.objectStore("defaults").get("current");
      req.onsuccess = () => {
        const v = req.result;
        if (v && v.ws && v.node) resolve({ ws: v.ws, node: v.node });
        else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function handleShareTarget(request) {
  const url = new URL(request.url);
  const debugId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const debug = {
    id: debugId,
    at: Date.now(),
    source: "sw-share-target",
    request: {
      url: request.url,
      path: url.pathname,
      search: url.search,
      params: paramsObject(url.searchParams),
      method: request.method,
      mode: request.mode,
      destination: request.destination,
      referrer: request.referrer,
      contentType: request.headers.get("content-type") || "",
      accept: request.headers.get("accept") || "",
    },
    form: null,
    result: { status: "pending", savedCount: 0, error: "" },
  };
  let diagnostic = "ok";
  let savedCount = 0;
  try {
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((f) => f && typeof f === "object" && "size" in f && f.size > 0);
    const entries = [];
    for (const [key, value] of form.entries()) {
      if (value && typeof value === "object" && "size" in value) {
        entries.push({
          key,
          kind: "file",
          name: safeString(value.name || "shared-file", 160),
          type: safeString(value.type || "", 160),
          size: value.size || 0,
        });
      } else {
        entries.push({ key, kind: "field", value: safeString(value, 600) });
      }
    }
    const meta = {
      title: form.get("title") || "",
      text: form.get("text") || "",
      url: form.get("url") || "",
    };
    debug.form = {
      keys: Array.from(new Set(entries.map((entry) => entry.key))),
      entries,
      meta: {
        title: safeString(meta.title, 600),
        text: safeString(meta.text, 600),
        url: safeString(meta.url, 600),
      },
      fileCount: files.length,
      files: files.map((file) => ({
        name: safeString(file.name || "shared-file", 160),
        type: safeString(file.type || "", 160),
        size: file.size || 0,
      })),
    };
    if (files.length) {
      await saveShared(files, meta);
      savedCount = files.length;
    } else if ((meta.title && String(meta.title).trim()) || (meta.text && String(meta.text).trim()) || (meta.url && String(meta.url).trim())) {
      // Samsung Browser / Chrome on Android often shares only title+text (URL/text share).
      // Persist a synthetic text "file" so the user sees the share instead of a no-files error.
      const body = [meta.title, meta.text, meta.url].filter((v) => v && String(v).trim()).join("\n");
      const blob = new Blob([body], { type: "text/plain" });
      const synthetic = new File([blob], `shared-${Date.now()}.txt`, { type: "text/plain" });
      await saveShared([synthetic], meta);
      savedCount = 1;
      diagnostic = "ok-text";
    } else {
      diagnostic = "no-files";
    }
  } catch (err) {
    diagnostic = `error:${(err && err.message) || "unknown"}`;
    debug.result.error = (err && (err.stack || err.message)) || "unknown";
  }
  debug.result.status = diagnostic;
  debug.result.savedCount = savedCount;
  await saveDebug(debug);
  const def = await readDefaults();
  const params = new URLSearchParams();
  if (def) {
    params.set("ws", def.ws);
    params.set("node", def.node);
  }
  params.set("share_status", diagnostic);
  params.set("share_count", String(savedCount));
  params.set("request_url", url.pathname + url.search);
  params.set("request_params", JSON.stringify(paramsObject(url.searchParams)));
  params.set("debug_id", debugId);
  const qs = params.toString();
  return Response.redirect(`${url.origin}/share-inbox${qs ? `?${qs}` : ""}`, 303);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Web Share Target — Android share sheet posts here.
  if (req.method === "POST" && url.pathname === "/share-inbox") {
    event.respondWith(handleShareTarget(req));
    return;
  }

  if (req.method !== "GET") return;
  // Never cache server functions / API / SSR HTML navigations.
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            // Cache under the request URL (without query) so /share-inbox stays /share-inbox.
            const cacheKey = new Request(url.origin + url.pathname);
            caches.open(CACHE).then((c) => c.put(cacheKey, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const c = await caches.open(CACHE);
          const cacheKey = new Request(url.origin + url.pathname);
          return (
            (await c.match(cacheKey)) ||
            (await c.match("/share-inbox")) ||
            (await c.match("/"))
          );
        }),
    );
    return;
  }
  // Stale-while-revalidate for assets.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      const target = list.find((c) => "focus" in c);
      if (target) return target.focus();
      return self.clients.openWindow("/todos");
    }),
  );
});
