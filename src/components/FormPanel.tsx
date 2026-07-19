import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Reusable form panel — the app's standard "add / edit" surface.
//
// Behaviours (shared by every form that uses it, per the MintMap form standard):
//  • Desktop: a wide panel (≥480px, ~600px ideal, ≤50vw) sliding in from the right.
//  • Mobile: a full-screen form (100dvh) with safe-area-aware header/footer.
//  • Dimmed, blurred backdrop with an open/close animation.
//  • Auto-focus the first field on open; keep Tab focus trapped inside the panel.
//  • Save button pinned to the bottom (with mobile safe-area) + Cmd/Ctrl+Enter.
//  • Warn before discarding unsaved changes via a styled dialog (backdrop/Esc/close).
//  • Honour the user's "reduce motion" preference.
//  • Scrollable, momentum-friendly body that never scrolls the page behind it.
// The caller closes the panel on a successful save and shows the toast, so the
// underlying list (a reactive store) refreshes on its own.

export type FormPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Plain string, or a node when the surface needs an inline title editor. */
  title: ReactNode;
  /** Announced to screen readers / used as the dialog label. */
  ariaLabel?: string;
  description?: ReactNode;
  /** Icon shown left of the title (standard: every panel header has one). */
  icon?: ReactNode;
  /** Small badge next to the title, e.g. "AI önerisi" / "Demo modu". */
  badge?: ReactNode;
  /** Unsaved edits present → confirm before closing. */
  dirty?: boolean;
  /** Save in flight → footer shows a spinner and disables inputs. */
  saving?: boolean;
  /** Disable the save button (e.g. required field empty). */
  canSave?: boolean;
  saveLabel?: string;
  /**
   * Explicit-save forms pass this to get the standard footer. Live-editing
   * surfaces (which persist on change) omit it — no footer is rendered.
   */
  onSave?: () => void;
  children: ReactNode;
  /** Optional extra control on the left of the footer (e.g. a delete button). */
  footerStart?: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function FormPanel({
  open,
  onClose,
  title,
  ariaLabel,
  description,
  icon,
  badge,
  dirty = false,
  saving = false,
  canSave = true,
  saveLabel = "Kaydet",
  onSave,
  children,
  footerStart,
}: FormPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [confirmClose, setConfirmClose] = useState(false);
  // Self-managed mount: AnimatePresence's exit-unmount is unreliable in this
  // app's runtime (React 19 + framer-motion under TanStack Start — exit
  // animations complete but the node is never removed, leaving an invisible
  // click-blocking backdrop). Instead we keep the panel mounted through its
  // close animation and unmount it ourselves via onAnimationComplete.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    // Closing: unmount once the exit animation would have finished. A timer is
    // used rather than framer's onAnimationComplete because animation-complete
    // callbacks don't fire reliably in this runtime.
    const t = setTimeout(() => setMounted(false), reduceMotion ? 0 : 340);
    return () => clearTimeout(t);
  }, [open, reduceMotion]);

  function attemptClose() {
    if (saving) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  // Reset the discard dialog whenever the panel itself closes.
  useEffect(() => {
    if (!open) setConfirmClose(false);
  }, [open]);

  // Keyboard: Esc closes (dirty guard), Cmd/Ctrl+Enter saves, Tab stays trapped.
  // Also lock the page scroll behind the panel while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // While the discard dialog is up, it owns the keyboard.
      if (confirmClose) return;

      if (e.key === "Escape") {
        e.preventDefault();
        attemptClose();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        if (onSave && canSave && !saving) {
          e.preventDefault();
          onSave();
        }
        return;
      }
      if (e.key === "Tab") {
        const root = panelRef.current;
        if (!root) return;
        const items = Array.from(
          root.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty, saving, canSave, confirmClose]);

  // Auto-focus the first field once the panel is on screen.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(
      () => {
        const root = bodyRef.current;
        if (!root) return;
        const target =
          root.querySelector<HTMLElement>("[data-autofocus]") ??
          root.querySelector<HTMLElement>(
            "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])",
          );
        target?.focus();
        target?.scrollIntoView({ block: "nearest" });
      },
      reduceMotion ? 0 : 260,
    );
    return () => clearTimeout(t);
  }, [open, reduceMotion]);

  const panelTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", damping: 32, stiffness: 320 } as const);

  return (
    <>
    {mounted && (
        <div
          className="fixed inset-0 z-[60]"
          // While closing (open=false) let clicks pass through so the exiting,
          // now-invisible backdrop can never block the UI underneath.
          style={{ pointerEvents: open ? "auto" : "none" }}
        >
          <motion.div
            initial={{ opacity: reduceMotion ? 1 : 0 }}
            animate={{ opacity: open ? 1 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={attemptClose}
            className="absolute inset-0 bg-[rgba(15,23,42,0.34)] backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            initial={{ x: reduceMotion ? 0 : "100%" }}
            animate={{ x: open ? 0 : "100%" }}
            transition={panelTransition}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
            className="absolute inset-y-0 right-0 flex h-[100dvh] w-full flex-col bg-card shadow-leaf sm:w-[600px] sm:min-w-[480px] sm:max-w-[50vw]"
          >
            {/* Live region: announces save state to screen readers. */}
            <div className="sr-only" role="status" aria-live="polite">
              {saving ? "Kaydediliyor…" : ""}
            </div>

            {/* Header */}
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {icon && <span className="mt-0.5 shrink-0 text-primary">{icon}</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    {typeof title === "string" ? (
                      <h2 className="truncate text-base font-bold leading-tight">{title}</h2>
                    ) : (
                      <div className="min-w-0 flex-1">{title}</div>
                    )}
                    {badge}
                  </div>
                  {description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
                  )}
                </div>
              </div>
              <button
                onClick={attemptClose}
                aria-label="Kapat"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Scrollable body */}
            <div
              ref={bodyRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4"
            >
              {children}
            </div>

            {/* Sticky footer — only for explicit-save forms. Live-editing
                surfaces (NodeSheet etc.) persist on change and pass no onSave. */}
            {(onSave || footerStart) && (
              <footer className="flex shrink-0 items-center gap-2 border-t border-border/60 bg-card px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
                {footerStart}
                {onSave && (
                  <>
                    <button
                      onClick={attemptClose}
                      disabled={saving}
                      className="ml-auto rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
                    >
                      Vazgeç
                    </button>
                    <button
                      onClick={onSave}
                      disabled={saving || !canSave}
                      className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      {saving ? "Kaydediliyor…" : saveLabel}
                    </button>
                  </>
                )}
              </footer>
            )}
          </motion.div>
        </div>
      )}

    {/* Unsaved-changes discard dialog — sibling of the panel so it is never
        caught inside the panel's own mount/unmount lifecycle. */}
    <UnsavedChangesDialog
      open={confirmClose}
      reduceMotion={!!reduceMotion}
      onKeepEditing={() => setConfirmClose(false)}
      onDiscard={() => {
        setConfirmClose(false);
        onClose();
      }}
    />
    </>
  );
}

function UnsavedChangesDialog({
  open,
  reduceMotion,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean;
  reduceMotion: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Default focus on the safe (non-destructive) action.
    const t = setTimeout(() => keepRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onKeepEditing();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onKeepEditing]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Değişiklikler kaydedilmedi"
    >
          <motion.div
            initial={{ opacity: reduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={onKeepEditing}
            className="absolute inset-0 bg-[rgba(15,23,42,0.44)]"
          />
          <motion.div
            initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-leaf"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold leading-tight">Değişiklikler kaydedilmedi</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bu formda kaydedilmemiş değişiklikler var. Çıkarsanız yaptığınız
                  değişiklikler kaybolacak.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                ref={keepRef}
                onClick={onKeepEditing}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Düzenlemeye devam et
              </button>
              <button
                onClick={onDiscard}
                className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-destructive/50"
              >
                Değişiklikleri sil ve çık
              </button>
            </div>
          </motion.div>
    </div>
  );
}
