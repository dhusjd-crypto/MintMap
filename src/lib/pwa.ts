// Registers the service worker and exposes install-prompt helpers.
let deferredPrompt: any = null;
const listeners = new Set<(canInstall: boolean) => void>();

function shouldSkipSW(): boolean {
  if (typeof window === "undefined") return true;
  // Allow disabling via ?sw=off for cleanup.
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  // Never register inside the Lovable editor iframe.
  if (window.top !== window.self) return true;
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev") ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return true;
  }
  return false;
}

export function initPWA() {
  if (typeof window === "undefined") return;
  if ("serviceWorker" in navigator) {
    if (shouldSkipSW()) {
      // Make sure no stale SW is left running in preview/iframe contexts.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
        .catch(() => {});
    } else {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }
  }
  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((l) => l(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l(false));
  });
}

export function canInstall() {
  return !!deferredPrompt;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((l) => l(false));
  return choice?.outcome === "accepted";
}

export function onInstallAvailability(cb: (canInstall: boolean) => void) {
  listeners.add(cb);
  cb(!!deferredPrompt);
  return () => listeners.delete(cb);
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const r = await Notification.requestPermission();
  return r === "granted";
}
