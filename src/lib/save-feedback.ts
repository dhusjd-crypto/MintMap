import { useSyncExternalStore } from "react";
import { toast } from "sonner";

// Post-save feedback plumbing for the form standard (§12–13).
//
// After a successful save the caller announces the affected node id; the
// mindmap canvas listens, brings that node into view (preserving zoom) and
// flashes it briefly so the user sees *what* changed. The store is local and
// reactive, so the "refresh the list" part of §13 happens on its own — this
// only covers the "scroll into view + highlight" part.

/** How long the saved node stays highlighted (§13: ~1–2s). */
export const SAVED_HIGHLIGHT_MS = 1600;
/** Success toasts stay up 6–9s and are dismissible (§12). */
export const SUCCESS_TOAST_MS = 7000;
/** Failure toasts stay up 10–14s (§14). */
export const ERROR_TOAST_MS = 12000;

let savedNodeId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Mark a node as just-created/just-updated so the canvas can reveal it. */
export function announceSavedNode(nodeId: string | null | undefined) {
  if (!nodeId) return;
  savedNodeId = nodeId;
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    savedNodeId = null;
    timer = null;
    emit();
  }, SAVED_HIGHLIGHT_MS);
}

export function useSavedNodeId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => savedNodeId,
    () => null,
  );
}

/**
 * Standard success flow (§12): show the notification, reveal + highlight the
 * affected node. The caller closes the panel — keeping that explicit so a form
 * can decide to stay open (e.g. "save and add another").
 */
export function notifySaved(message: string, nodeId?: string | null) {
  toast.success(message, { duration: SUCCESS_TOAST_MS });
  announceSavedNode(nodeId);
}

/** Standard failure flow (§14): keep the panel open, long dismissible toast. */
export function notifySaveFailed(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  toast.error(msg, { duration: ERROR_TOAST_MS });
}
