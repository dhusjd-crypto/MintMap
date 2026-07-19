import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { AUTH_COOKIE } from "./auth.middleware";

// Server-side password check. Replaces the old client-only `mint`/`mint`
// comparison, which anyone could bypass by editing localStorage.
//
// - APP_PASSWORD: the login password (defaults to "mint" for local dev).
// - APP_ACCESS_TOKEN: the bearer stored in an HttpOnly `mm_auth` cookie that
//   auth.middleware validates on the AI endpoints. Leave unset in dev
//   (protection off); set a long random value as a secret in production.
export const appLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { password?: string }) => {
    if (!d?.password) throw new Error("Şifre gerekli");
    return { password: d.password };
  })
  .handler(async ({ data }) => {
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
