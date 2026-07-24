// Client-side Google OAuth via Google Identity Services (GIS) token flow.
//
// Replaces the old Lovable connector gateway: the user connects their own
// Google account in a popup, and we hold a short-lived access token in memory
// to call the Google Calendar / Drive REST APIs directly from the browser. No
// server-side token storage — fits the local-first model.
//
// Setup: create an OAuth "Web application" client in Google Cloud Console, add
// your origin to "Authorized JavaScript origins", and put the client id in
// `.env` as `VITE_GOOGLE_CLIENT_ID=…` (client-safe, shipped to the browser).

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const GRANT_STORAGE_KEY = "mintmap.googleGrant.v1";

// One consent covers every Google feature in the app.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

type GisTokenResponse = { access_token?: string; expires_in?: number; error?: string };
type GisTokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type GisOAuth2 = {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (r: GisTokenResponse) => void;
    error_callback?: (e: { type?: string }) => void;
  }) => GisTokenClient;
};

function gis(): GisOAuth2 | undefined {
  return (window as unknown as { google?: { accounts?: { oauth2?: GisOAuth2 } } }).google?.accounts
    ?.oauth2;
}

let gisReady: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (gisReady) return gisReady;
  gisReady = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("no window"));
      return;
    }
    if (gis()) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google giriş betiği yüklenemedi"));
    document.head.appendChild(s);
  });
  return gisReady;
}

let cached: { token: string; expiresAt: number } | null = null;
let everGranted = false;

function hasRememberedGrant(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GRANT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberGrant(): void {
  everGranted = true;
  try {
    window.localStorage.setItem(GRANT_STORAGE_KEY, "true");
  } catch {
    // The authorization still works when browser storage is unavailable.
  }
}

/** True when a Google OAuth client id is configured (build/env). */
export function isGoogleConfigured(): boolean {
  return !!CLIENT_ID;
}

/**
 * Return a valid access token for the app's Google scopes, prompting the
 * consent popup on first use and refreshing silently afterwards.
 * `forcePrompt` re-shows the account/consent chooser (for a "Connect" button).
 */
export function getAccessToken(opts: { forcePrompt?: boolean } = {}): Promise<string> {
  if (!CLIENT_ID) {
    return Promise.reject(
      new Error("Google bağlantısı yapılandırılmamış — .env içine VITE_GOOGLE_CLIENT_ID ekle"),
    );
  }
  if (!opts.forcePrompt && cached && cached.expiresAt > Date.now() + 60_000) {
    return Promise.resolve(cached.token);
  }
  return loadGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const oauth2 = gis();
        if (!oauth2) {
          reject(new Error("Google giriş yüklenemedi"));
          return;
        }
        const client = oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: GOOGLE_SCOPES,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error || "Google yetkilendirme iptal edildi"));
              return;
            }
            rememberGrant();
            cached = {
              token: resp.access_token,
              expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
            };
            resolve(resp.access_token);
          },
          error_callback: (e) => reject(new Error(e.type || "Google yetkilendirme başarısız")),
        });
        // Google persists consent per account/client id. Keep a local marker so
        // a page reload does not force the test-app warning again. With an
        // empty prompt, GIS asks only if a new consent is genuinely required.
        client.requestAccessToken({
          prompt: opts.forcePrompt ? "consent" : everGranted || hasRememberedGrant() ? "" : "consent",
        });
      }),
  );
}

/** Drop the cached token (e.g. a "disconnect" affordance). */
export function forgetGoogleToken(): void {
  cached = null;
  everGranted = false;
  try {
    window.localStorage.removeItem(GRANT_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage; the in-memory token has still been cleared.
  }
}
