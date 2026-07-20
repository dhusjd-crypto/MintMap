import { createMiddleware } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { createRateLimiter } from "./rate-limit";

// Gate for the cost-bearing AI server functions. Without it, anyone who finds
// the public URL could call the AI endpoints and burn the owner's API quota —
// the client-side /unlock gate does NOT protect server functions.
//
// After login the server sets an HttpOnly `mm_auth` cookie; this middleware
// checks it on every protected call. No-op when APP_ACCESS_TOKEN is unset
// (local dev) so nothing breaks without configuration — set APP_ACCESS_TOKEN as
// a secret to turn protection ON.

export const AUTH_COOKIE = "mm_auth";

// Shared password means auth alone can't stop one session from draining the AI
// quota, so protected calls are also rate limited. Overridable for tuning
// without a code change.
const AI_RATE_LIMIT = Number(process.env.AI_RATE_LIMIT ?? 30);
const AI_RATE_WINDOW_MS = Number(process.env.AI_RATE_WINDOW_MS ?? 60_000);

const aiLimiter = createRateLimiter(AI_RATE_LIMIT, AI_RATE_WINDOW_MS);

export const requireAppAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const expected = process.env.APP_ACCESS_TOKEN;
  const token = getCookie(AUTH_COOKIE) || "";
  if (expected) {
    if (token !== expected) {
      throw new Error("Yetkisiz — önce giriş yap");
    }
  }

  // Keyed by session cookie; falls back to a shared bucket in unconfigured dev.
  const { allowed, retryAfterMs } = aiLimiter.check(token || "anonymous");
  if (!allowed) {
    throw new Error(
      `Çok fazla istek — ${Math.ceil(retryAfterMs / 1000)} saniye sonra tekrar dene`,
    );
  }

  return next();
});
