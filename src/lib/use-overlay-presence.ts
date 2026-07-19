import { useEffect, useState } from "react";

// Keeps an overlay mounted through its close animation, then unmounts it.
//
// Why this exists: in this app's runtime (React 19 + framer-motion under
// TanStack Start) AnimatePresence's exit lifecycle is unreliable — the exit
// animation plays but the element is never removed from the DOM, leaving an
// invisible full-screen backdrop that still captures clicks and freezes the UI.
// Instead of relying on AnimatePresence, callers:
//   • gate rendering on the returned `mounted` flag,
//   • drive child `animate` from `open` (open ? shown : hidden), and
//   • set the backdrop's pointer-events from `open` so a closing overlay never
//     blocks the UI even during the brief exit window.
//
// `exitMs` should comfortably cover the close animation (spring or tween).
export function useOverlayPresence(open: boolean, exitMs = 340): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);
  return mounted;
}
