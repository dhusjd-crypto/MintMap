import { useEffect, useState } from "react";
import { Download, X, Share, Plus, MoreVertical, CheckCircle2, AlertTriangle, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

type InstallStatus =
  | { kind: "idle" }
  | { kind: "prompting" }
  | { kind: "accepted" }
  | { kind: "dismissed" }
  | { kind: "installed" }
  | { kind: "unavailable" }
  | { kind: "failed"; message: string };

const STATUS_STORAGE_KEY = "mintmap.installStatus.v1";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android-chrome" | "android-firefox" | "ios-safari" | "desktop" | "other";

const DISMISS_KEY = "mintmap.installBanner.dismissedAt.v2";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 1 hafta

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  if (isIOS) return "ios-safari";
  const isAndroid = /Android/i.test(ua);
  if (isAndroid && /Chrome|CriOS|Chromium/i.test(ua)) return "android-chrome";
  if (isAndroid && /Firefox/i.test(ua)) return "android-firefox";
  if (/Macintosh|Windows|Linux/i.test(ua)) return "desktop";
  return "other";
}

function safeGetDismissedAt() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) || 0);
  } catch {
    return 0;
  }
}

function safeSetDismissedAt() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures; install help should still work.
  }
}

function shouldForceInstallHelp() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("install") === "1" || params.get("pwa") === "help";
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [status, setStatus] = useState<InstallStatus>({ kind: "idle" });

  const persistStatus = (s: InstallStatus) => {
    try {
      localStorage.setItem(
        STATUS_STORAGE_KEY,
        JSON.stringify({ ...s, at: Date.now() }),
      );
    } catch {
      // ignore
    }
  };

  const updateStatus = (s: InstallStatus, notify = true) => {
    setStatus(s);
    persistStatus(s);
    if (!notify) return;
    switch (s.kind) {
      case "prompting":
        toast.loading("Yükleme penceresi açılıyor…", { id: "pwa-install" });
        break;
      case "accepted":
        toast.success("Yükleme onaylandı, ana ekrana ekleniyor…", { id: "pwa-install" });
        break;
      case "installed":
        toast.success("MintMap ana ekrana eklendi 🎉", { id: "pwa-install", duration: 5000 });
        break;
      case "dismissed":
        toast.message("Yükleme iptal edildi", {
          id: "pwa-install",
          description: "İstediğin zaman tekrar deneyebilirsin.",
        });
        break;
      case "unavailable":
        toast.message("Tarayıcı otomatik yüklemeyi sunmadı", {
          id: "pwa-install",
          description: "Adım adım rehberi açtık.",
        });
        break;
      case "failed":
        toast.error("Yükleme başlatılamadı", {
          id: "pwa-install",
          description: s.message,
        });
        break;
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) {
      updateStatus({ kind: "installed" }, false);
      return;
    }

    const p = detectPlatform();
    setPlatform(p);

    const forceHelp = shouldForceInstallHelp();
    const dismissedAt = safeGetDismissedAt();
    const dismissedRecently = dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS;
    if (dismissedRecently && !forceHelp) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      updateStatus({ kind: "installed" });
    };
    window.addEventListener("appinstalled", onInstalled);

    const dm = window.matchMedia?.("(display-mode: standalone)");
    const onDM = (ev: MediaQueryListEvent) => {
      if (ev.matches) updateStatus({ kind: "installed" });
    };
    dm?.addEventListener?.("change", onDM);

    // Mobil tarayıcılarda beforeinstallprompt gelmese bile yerleşik rehberi göster.
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    if (forceHelp) {
      setVisible(true);
      setHowToOpen(true);
    } else if (p === "android-chrome") {
      setVisible(true);
    } else if (p === "ios-safari" || p === "android-firefox") {
      fallbackTimer = setTimeout(() => setVisible(true), 800);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      dm?.removeEventListener?.("change", onDM);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    safeSetDismissedAt();
    // "installed/dismissed/failed" durum afişleri showStatusBanner ile ayrı tutuluyor;
    // X'e basınca onları da kapat ki "ana ekrana eklendi" mesajı takılı kalmasın.
    if (status.kind === "installed" || status.kind === "dismissed" || status.kind === "failed") {
      updateStatus({ kind: "idle" }, false);
    }
  };

  // "Yüklendi" afişini birkaç saniye sonra otomatik gizle.
  useEffect(() => {
    if (status.kind !== "installed") return;
    const t = setTimeout(() => {
      setVisible(false);
      updateStatus({ kind: "idle" }, false);
    }, 6000);
    return () => clearTimeout(t);
  }, [status.kind]);

  const install = async () => {
    if (deferred) {
      try {
        updateStatus({ kind: "prompting" });
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") {
          updateStatus({ kind: "accepted" });
          setVisible(false);
          safeSetDismissedAt();
        } else {
          updateStatus({ kind: "dismissed" });
        }
        setDeferred(null);
      } catch (err) {
        updateStatus({
          kind: "failed",
          message: err instanceof Error ? err.message : String(err),
        });
        setHowToOpen(true);
      }
    } else {
      updateStatus({ kind: "unavailable" });
      setHowToOpen(true);
    }
  };

  const showStatusBanner =
    status.kind === "failed" ||
    status.kind === "dismissed" ||
    // "installed" afişini sadece bu oturumda yüklenme görülürse göster (visible=true).
    (status.kind === "installed" && visible);

  if (!visible && !showStatusBanner) return null;

  const statusRow = (() => {
    switch (status.kind) {
      case "prompting":
        return (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Yükleme penceresi bekleniyor…
          </div>
        );
      case "accepted":
        return (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Onaylandı, kuruluyor…
          </div>
        );
      case "installed":
        return (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Yükleme başarılı — ana ekrandan açabilirsin.
          </div>
        );
      case "dismissed":
        return (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Yükleme iptal edildi.
          </div>
        );
      case "unavailable":
        return (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Info className="h-3.5 w-3.5" />
            Tarayıcı otomatik yüklemeyi sunmadı — adımları izle.
          </div>
        );
      case "failed":
        return (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">Yükleme başlatılamadı: {status.message}</span>
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <>
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="install-prompt-title"
        aria-describedby="install-prompt-desc"
        className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur md:left-auto md:right-4 md:mx-0"
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            {status.kind === "installed" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Download className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p id="install-prompt-title" className="text-sm font-semibold text-foreground">
              {status.kind === "installed"
                ? "MintMap yüklendi"
                : "MintMap'i ana ekrana ekle"}
            </p>
            <p id="install-prompt-desc" className="mt-0.5 text-xs text-muted-foreground">
              {status.kind === "installed"
                ? "Artık ana ekrandan uygulama olarak açabilirsin."
                : "Android Chrome menüsü görünmese bile buradan adımları açabilirsiniz."}
            </p>
            <div role="status" aria-live="polite" aria-atomic="true">
              {statusRow}
            </div>
            {status.kind !== "installed" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={install}
                  className="h-11 min-w-11"
                  disabled={status.kind === "prompting" || status.kind === "accepted"}
                  aria-label={
                    status.kind === "failed" || status.kind === "dismissed"
                      ? "Yüklemeyi tekrar dene"
                      : deferred
                        ? "MintMap'i ana ekrana yükle"
                        : "Ana ekrana ekleme adımlarını göster"
                  }
                  aria-busy={status.kind === "prompting" || status.kind === "accepted"}
                >
                  {status.kind === "failed" || status.kind === "dismissed"
                    ? "Tekrar dene"
                    : deferred
                      ? "Yükle"
                      : "Nasıl eklenir?"}
                </Button>
                {!deferred && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHowToOpen(true)}
                    className="h-11 min-w-11"
                    aria-label="Ana ekrana ekleme adımlarını göster"
                    aria-haspopup="dialog"
                    aria-expanded={howToOpen}
                  >
                    Adımları gör
                  </Button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Ana ekrana ekleme uyarısını kapat"
            onClick={dismiss}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>




      <Dialog open={howToOpen} onOpenChange={setHowToOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ana ekrana nasıl eklenir?</DialogTitle>
            <DialogDescription>
              {platform === "ios-safari"
                ? "iPhone / iPad — Safari"
                : platform === "android-firefox"
                ? "Android — Firefox"
                : platform === "android-chrome"
                ? "Android — Chrome"
                : "Tarayıcı menüsünden ekleyebilirsiniz."}
            </DialogDescription>
          </DialogHeader>

          {platform === "android-chrome" && (
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                <span className="flex items-center gap-1">
                  Sağ üstteki <MoreVertical className="inline h-4 w-4" /> menü simgesine dokunun.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
                <span>
                  <b>"Uygulamayı yükle"</b> ya da <b>"Ana ekrana ekle"</b> seçeneğine dokunun.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
                <span>Açılan pencerede <b>Yükle</b> / <b>Ekle</b>'ye dokunun. Simge ana ekranınızda belirir.</span>
              </li>
              <li className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                Seçenek görünmüyorsa: sayfayı bir kez yenileyin, ya da Chrome ayarları → Site ayarları → Yüklü uygulamalar bölümünden eski kaydı silip tekrar deneyin.
              </li>
            </ol>
          )}

          {platform === "ios-safari" && (
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                <span className="flex items-center gap-1">
                  Alt çubuktaki <Share className="inline h-4 w-4" /> <b>Paylaş</b> simgesine dokunun.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
                <span className="flex items-center gap-1">
                  Listede <b>Ana Ekrana Ekle</b> <Plus className="inline h-4 w-4" /> öğesine dokunun.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
                <span>Sağ üstte <b>Ekle</b>'ye dokunun.</span>
              </li>
              <li className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                Not: Chrome / başka tarayıcılar yerine <b>Safari</b> kullanın — iOS yalnızca Safari üzerinden ana ekrana eklemeye izin verir.
              </li>
            </ol>
          )}

          {platform === "android-firefox" && (
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                <span className="flex items-center gap-1">
                  Adres çubuğundaki <MoreVertical className="inline h-4 w-4" /> menüye dokunun.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
                <span><b>Yükle</b> veya <b>Ana ekrana ekle</b>'yi seçin.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
                <span>Onaylayın — simge ana ekranınıza eklenir.</span>
              </li>
            </ol>
          )}

          {(platform === "desktop" || platform === "other") && (
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                <span>Adres çubuğunun sağındaki <Download className="inline h-4 w-4" /> yükleme simgesine tıklayın.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
                <span>Açılan pencerede <b>Yükle</b>'ye tıklayın.</span>
              </li>
              <li className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                Simge yoksa tarayıcı menüsünden "Uygulamayı yükle" / "Kısayol oluştur" seçeneğini kullanın.
              </li>
            </ol>
          )}

          <div className="mt-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setHowToOpen(false)}>
              Tamam
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
