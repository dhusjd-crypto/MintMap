import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "../components/ui/sonner";

// Defer non-critical overlays until after first paint to shrink the
// initial route bundle and speed up LCP / TTI.
const PomodoroWidget = lazy(() =>
  import("../components/PomodoroWidget").then((m) => ({ default: m.PomodoroWidget })),
);
const CommandPalette = lazy(() =>
  import("../components/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);
const AILauncher = lazy(() =>
  import("../components/AILauncher").then((m) => ({ default: m.AILauncher })),
);
const InstallPrompt = lazy(() =>
  import("../components/InstallPrompt").then((m) => ({ default: m.InstallPrompt })),
);

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#00C7A7" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "MintMap" },
      { title: "MintMap" },
      { name: "description", content: "MintMap — kişisel mindmap ve görev uygulaması." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "MintMap" },
      { property: "og:description", content: "MintMap — kişisel mindmap ve görev uygulaması." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "MintMap" },
      { name: "twitter:description", content: "MintMap — kişisel mindmap ve görev uygulaması." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d879a759-5c3c-40ca-b835-a095145ac797/id-preview-f6d04388--d2f54b2d-f10e-4ade-9a50-a206f539cd04.lovable.app-1780357327215.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d879a759-5c3c-40ca-b835-a095145ac797/id-preview-f6d04388--d2f54b2d-f10e-4ade-9a50-a206f539cd04.lovable.app-1780357327215.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icons/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-180.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Gate non-critical overlays until after first paint so they don't
  // compete with route hydration / LCP. requestIdleCallback when
  // available, otherwise a microtask after mount.
  const [overlaysReady, setOverlaysReady] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);

  useEffect(() => {
    // Client-side şifre kapısı: kilitli değilse /unlock sayfasına gönder.
    try {
      const unlocked = sessionStorage.getItem("mintmap:unlocked") === "1";
      if (!unlocked && window.location.pathname !== "/unlock") {
        window.location.replace("/unlock");
        return;
      }
    } catch {
      // sessionStorage erişilemiyorsa geçişe izin ver.
    }
    setGateChecked(true);

    import("../lib/theme").then((m) => m.initTheme());
    import("../lib/pwa").then((m) => m.initPWA());
    import("../lib/reminder-scheduler").then((m) => m.initReminderScheduler());

    const ric: ((cb: () => void) => number) | undefined =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
    const handle = ric
      ? ric(() => setOverlaysReady(true))
      : window.setTimeout(() => setOverlaysReady(true), 0);
    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback;
      if (ric && cic) cic(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  if (!gateChecked && typeof window !== "undefined" && window.location.pathname !== "/unlock") {
    return <div className="min-h-dvh bg-white" />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* Respect user's reduced-motion preference across all framer-motion animations. */}
      <MotionConfig reducedMotion="user">
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        {overlaysReady && (
          <Suspense fallback={null}>
            <PomodoroWidget />
            <CommandPalette />
            <AILauncher />
            <InstallPrompt />
          </Suspense>
        )}
        <Toaster richColors position="top-center" />
      </MotionConfig>
    </QueryClientProvider>
  );
}
