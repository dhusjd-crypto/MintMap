import { useEffect } from "react";
import type { AnyRouter } from "@tanstack/react-router";

const ENTRY = "mintmap-entry";
const GUARD = "mintmap-back-guard";

type AppHistoryState = { mintmapBack?: typeof ENTRY | typeof GUARD };

function stateWith(marker: AppHistoryState["mintmapBack"]) {
  return { ...(window.history.state ?? {}), mintmapBack: marker };
}

/**
 * Keeps the first browser-back action inside MintMap. This matters when a
 * mobile user opens a section directly: going back should return to Mindmap,
 * not immediately leave the app for the previous Chrome page.
 */
export function useAppBackNavigation(router: AnyRouter) {
  useEffect(() => {
    if (window.location.pathname === "/unlock") return;

    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.mintmapBack !== ENTRY && currentState?.mintmapBack !== GUARD) {
      window.history.replaceState(stateWith(ENTRY), "", window.location.href);
      window.history.pushState(stateWith(GUARD), "", window.location.href);
    }

    const onPopState = (event: PopStateEvent) => {
      // Task panels add their own history entry. Let that panel consume Back
      // first, keeping the user on the current route (for example /todos).
      if ((window as unknown as { __mintmapTaskSheetOpen?: string }).__mintmapTaskSheetOpen) return;
      const marker = (event.state as AppHistoryState | null)?.mintmapBack;
      if (marker === GUARD) {
        // Consume the one in-app guard. A deep-linked section returns to the
        // main map; if already on the map it simply stays there.
        window.history.replaceState(stateWith(ENTRY), "", window.location.href);
        if (window.location.pathname !== "/") {
          void router.navigate({ to: "/", replace: true });
        }
      } else if (marker === ENTRY) {
        // The guard was already consumed, so the following history entry is
        // the browser page that preceded MintMap.
        window.history.back();
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [router]);
}
