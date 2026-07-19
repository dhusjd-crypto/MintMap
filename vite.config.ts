// Plain, self-hosted Vite config (no Lovable). Reconstructs the plugin stack the
// old @lovable.dev/vite-tanstack-config bundled — TanStack Start + React +
// Tailwind + tsconfig paths, with Nitro producing the deployable Cloudflare
// Worker at build time — minus all Lovable/sandbox/dev-tooling plugins
// (componentTagger, hmr-gate, dev-server-bridge, assets proxy, devtools
// inject-source).
//
// Note: the config MUST be a plain object or a *sync* function. An async config
// function makes TanStack Start's builder fall back to a default client build
// ("Could not resolve entry module index.html"), so nitro is imported statically
// and only added to the plugin list on `build`.
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// --- Server-only secrets -----------------------------------------------------
// Server functions read process.env.*; under the SSR/edge module graph `process`
// is a polyfill, so real env vars never arrive. Statically inline them into the
// SSR environment ONLY (never the client bundle). Values come from .env
// (gitignored) or the real shell env; absent keys are omitted so the runtime
// process.env lookup (e.g. Cloudflare secrets) still applies.
const mode = process.env.NODE_ENV || "development";
const fileEnv = loadEnv(mode, process.cwd(), "");
// Server-side AI keys only. Google Calendar/Drive are now client-side (GIS
// token), so their keys live in the browser env (VITE_GOOGLE_CLIENT_ID) instead.
const SERVER_SECRETS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "OLLAMA_BASE_URL",
] as const;

const ssrDefine: Record<string, string> = {};
for (const key of SERVER_SECRETS) {
  const value = fileEnv[key] || process.env[key];
  if (value) ssrDefine[`process.env.${key}`] = JSON.stringify(value);
}

export default defineConfig(({ command }) => {
  const isDev = command === "serve";

  return {
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      // React/Query must resolve to a single copy or hydration/context breaks.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    // host "::" so the dev server is reachable through the preview proxy;
    // allowedHosts lets the proxy's Host header through for HMR.
    server: { host: "::", port: 8080, allowedHosts: true },
    environments: {
      // Inline server-only secrets into the SSR environment (never the client).
      ssr: { define: ssrDefine },
      // Client-scoped dev NODE_ENV so React DevTools gets dev react-dom without a
      // global flip emitting jsxDEV that the react-server SSR can't resolve.
      ...(isDev
        ? { client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } } }
        : {}),
    },
    ...(isDev ? { esbuild: { keepNames: true } } : {}),
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Keep server-only modules out of the client bundle.
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Our SSR error wrapper (src/server.ts) is the server entry.
        server: { entry: "server" },
      }),
      // Nitro builds the deployable server bundle. Cloudflare Worker by default;
      // override with NITRO_PRESET (node-server, vercel, netlify, …). Build only.
      // Pin the Worker name so the generated wrangler.json is stable across
      // machines (otherwise nitro derives it from the git remote).
      ...(command === "build"
        ? [
            nitro({
              defaultPreset: "cloudflare-module",
              cloudflare: { wrangler: { name: "mintmap" } },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
