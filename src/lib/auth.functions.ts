import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { AUTH_COOKIE } from "./auth.middleware";

// Server-side password check. Replaces the old client-only `mint`/`mint`
// comparison, which anyone could bypass by editing localStorage.
//
// - APP_USERNAME: optional login username. If set, it is checked (case-
//   insensitive); if unset, the username field is ignored (local dev).
// - APP_PASSWORD: the login password (defaults to "mint" for local dev).
// - APP_ACCESS_TOKEN: the bearer stored in an HttpOnly `mm_auth` cookie that
//   auth.middleware validates on the AI endpoints. Leave unset in dev
//   (protection off); set a long random value as a secret in production.
export const appLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username?: string; password?: string }) => {
    if (!d?.password) throw new Error("Şifre gerekli");
    return { username: d.username ?? "", password: d.password };
  })
  .handler(async ({ data }) => {
    const expectedUser = process.env.APP_USERNAME;
    // Only enforce the username when one is configured, so dev (no env) still
    // works with just the password.
    if (expectedUser && data.username.trim().toLowerCase() !== expectedUser.toLowerCase()) {
      throw new Error("Kullanıcı adı veya şifre hatalı");
    }
    const expected = process.env.APP_PASSWORD || "mint";
    if (data.password !== expected) throw new Error("Kullanıcı adı veya şifre hatalı");

    const token = process.env.APP_ACCESS_TOKEN || "";
    if (token) {
      setCookie(AUTH_COOKIE, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return { ok: true };
  });
