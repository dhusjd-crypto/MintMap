import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Server functions are same-origin RPC endpoints; without this a third-party
// site could invoke them from a visitor's browser (their cookie rides along).
// TanStack's current request-middleware API exposes the server-function
// metadata directly, so keep the check here instead of depending on a removed
// helper export.
const csrfMiddleware = createMiddleware().server(async ({ request, serverFnMeta, next }) => {
  if (serverFnMeta) {
    const origin = request.headers.get("origin");
    const requestOrigin = new URL(request.url).origin;
    if (origin && origin !== requestOrigin) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
