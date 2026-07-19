import { createMiddleware } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

// Gate for the cost-bearing AI server functions. Without it, anyone who finds
// the public URL could call the AI endpoints and burn the owner's API quota —
// the client-side /unlock gate does NOT protect server functions.
//
// After login the server sets an HttpOnly `mm_auth` cookie; this middleware
// checks it on every protected call. No-op when APP_ACCESS_TOKEN is unset
// (local dev) so nothing breaks without configuration — set APP_ACCESS_TOKEN as
// a secret to turn protection ON.

export const AUTH_COOKIE = "mm_auth";

export const requireAppAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (expected) {
    const token = getCookie(AUTH_COOKIE) || "";
    if (token !== expected) {
      throw new Error("Yetkisiz — önce giriş yap");
    }
  }
  return next();
});
