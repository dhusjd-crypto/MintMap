// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// --- Server-only secrets -----------------------------------------------------
// Server functions read process.env.OPENAI_API_KEY / LOVABLE_API_KEY, but inside
// the SSR module graph `process` resolves to a polyfill (the Cloudflare target),
// so real env vars never arrive: every AI call reported "no provider configured"
// even with the key exported in the shell. Verified: same pid, config sees the
// key, the server fn sees "".
//
// Fix: statically inline the secrets into the SSR environment only. They are
// never added to the client environment, so nothing reaches the browser. Values
// come from .env (gitignored) or the real shell env. If a key is absent we omit
// it, leaving the runtime `process.env` lookup intact — which is how the
// deployed app gets its Cloudflare secrets.
const mode = process.env.NODE_ENV || "development";
const fileEnv = loadEnv(mode, process.cwd(), "");
const SERVER_SECRETS = [
  "OPENAI_API_KEY",
  "LOVABLE_API_KEY",
  "GOOGLE_DRIVE_API_KEY",
  "GOOGLE_CALENDAR_API_KEY",
] as const;

const ssrDefine: Record<string, string> = {};
for (const key of SERVER_SECRETS) {
  const value = fileEnv[key] || process.env[key];
  if (value) ssrDefine[`process.env.${key}`] = JSON.stringify(value);
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Local-dev only: allow the Claude preview proxy's Host header so Vite serves
  // its HMR client (/@vite/client) instead of rejecting it (403/404), which
  // otherwise breaks client hydration when the app is viewed through a proxy.
  vite: {
    server: {
      allowedHosts: true,
    },
    environments: {
      ssr: { define: ssrDefine },
    },
  },
});
