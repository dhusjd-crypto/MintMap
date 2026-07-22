import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Bell, CloudUpload, CloudDownload, Keyboard, Sparkles, CheckCircle2, AlertCircle, CalendarSync } from "lucide-react";
import { canInstall, onInstallAvailability, promptInstall, ensureNotificationPermission } from "@/lib/pwa";
import { mindmap, useNodes } from "@/lib/mindmap-store";
import { readBackupPayload, shouldAllowCloudSave, describeStoreSnapshot } from "@/lib/backup-format";
import { exportICS, exportMarkdown, downloadText } from "@/lib/export";
import { toast } from "sonner";
import { driveLoadSnapshot, driveSaveSnapshot } from "@/lib/drive.functions";
import { aiStatus } from "@/lib/ai.functions";
import { runCalendarSync } from "@/lib/calendar-sync";
import { useServerFn } from "@tanstack/react-start";

const SHORTCUTS: Array<[string, string]> = [
  ["⌘K / Ctrl+K", "Komut paleti"],
  ["⌘Z / Ctrl+Z", "Geri al"],
  ["⌘⇧Z", "Yinele"],
  ["?", "Bu pencere"],
];

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nodes = useNodes();
  const [installable, setInstallable] = useState(false);
  const [notif, setNotif] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState<string | null>(null);
  const [providers, setProviders] = useState<{ openai: boolean; gateway: boolean }>({ openai: false, gateway: true });
  const [provider, setProvider] = useState<"auto" | "openai" | "gateway">(
    () => (typeof window !== "undefined" ? (localStorage.getItem("mintmap.ai.provider") as "openai" | "gateway" | null) ?? "auto" : "auto"),
  );
  const [model, setModel] = useState<string>(
    () => (typeof window !== "undefined" ? localStorage.getItem("mintmap.ai.model") ?? "" : ""),
  );
  const [calAuto, setCalAuto] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem("mintmap.calendar.auto") === "on",
  );
  const [calLast, setCalLast] = useState<number | null>(
    () => (typeof window !== "undefined" ? Number(localStorage.getItem("mintmap.calendar.lastSyncAt") || 0) || null : null),
  );
  const fetchStatus = useServerFn(aiStatus);

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotif(Notification.permission);
    const off = onInstallAvailability(setInstallable);
    fetchStatus().then(setProviders).catch(() => {});
    return () => { off(); };
  }, [fetchStatus]);

  const updateProvider = (v: "auto" | "openai" | "gateway") => {
    setProvider(v);
    if (v === "auto") localStorage.removeItem("mintmap.ai.provider");
    else localStorage.setItem("mintmap.ai.provider", v);
  };
  const updateModel = (v: string) => {
    setModel(v);
    if (!v) localStorage.removeItem("mintmap.ai.model");
    else localStorage.setItem("mintmap.ai.model", v);
  };


  const handle = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ayarlar & senkron</DialogTitle>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            <Sparkles className="inline h-3 w-3 mr-1" /> AI sağlayıcı
          </h3>
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                {providers.openai ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                OpenAI (ChatGPT API)
              </span>
              <span className={`text-[11px] font-semibold ${providers.openai ? "text-primary" : "text-muted-foreground"}`}>
                {providers.openai ? "bağlı" : "bağlı değil"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                {providers.gateway ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                Lovable Gateway (Gemini)
              </span>
              <span className={`text-[11px] font-semibold ${providers.gateway ? "text-primary" : "text-muted-foreground"}`}>
                {providers.gateway ? "bağlı" : "bağlı değil"}
              </span>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-muted-foreground">Tercih edilen sağlayıcı</label>
              <select
                value={provider}
                onChange={(e) => updateProvider(e.target.value as "auto" | "openai" | "gateway")}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="auto">Otomatik (OpenAI, hata olursa Lovable)</option>
                <option value="openai" disabled={!providers.openai}>OpenAI</option>
                <option value="gateway" disabled={!providers.gateway}>Lovable Gateway</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-muted-foreground">Model (opsiyonel)</label>
              <select
                value={model}
                onChange={(e) => updateModel(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Varsayılan</option>
                <optgroup label="OpenAI">
                  <option value="gpt-4o-mini">gpt-4o-mini (hızlı, ucuz)</option>
                  <option value="gpt-4o">gpt-4o (güçlü)</option>
                  <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                </optgroup>
                <optgroup label="Gateway">
                  <option value="google/gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="google/gemini-2.5-pro">gemini-2.5-pro</option>
                </optgroup>
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              OpenAI anahtarın sunucu tarafında güvenle saklanır; tarayıcıya gönderilmez. Değiştirmek için projeden API anahtarı sırlarını güncelle.
            </p>
          </div>
        </section>


        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Uygulama</h3>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={!installable || !!busy}
            onClick={() => handle("install", async () => {
              const ok = await promptInstall();
              toast.success(ok ? "Yüklendi" : "İptal edildi");
            })}
          >
            <Smartphone className="mr-2 h-4 w-4" /> Ana ekrana ekle (PWA)
            {!installable && <span className="ml-auto text-[10px] text-muted-foreground">tarayıcı desteklemiyor</span>}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={notif === "granted" || busy === "notif"}
            onClick={() => handle("notif", async () => {
              const ok = await ensureNotificationPermission();
              setNotif(Notification.permission);
              toast[ok ? "success" : "error"](ok ? "Bildirimler açık" : "İzin verilmedi");
            })}
          >
            <Bell className="mr-2 h-4 w-4" /> Bildirimleri etkinleştir
            <span className="ml-auto text-[10px] text-muted-foreground">
              {notif === "granted" ? "açık" : notif === "denied" ? "engelli" : "kapalı"}
            </span>
          </Button>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Dışa aktar</h3>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              downloadText("mintmap.md", exportMarkdown(nodes), "text/markdown");
              toast.success("Markdown indirildi");
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Markdown (.md)
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              downloadText("mintmap.ics", exportICS(nodes), "text/calendar");
              toast.success("iCal indirildi — takvim uygulamana içe aktar");
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Takvim (.ics)
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              downloadText("mintmap-backup.json", JSON.stringify(mindmap.getFullSnapshot(), null, 2), "application/json");
              toast.success("Yedek indirildi");
            }}
          >
            <Download className="mr-2 h-4 w-4" /> JSON yedek
          </Button>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Google Drive senkron</h3>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={busy === "drive-up"}
            onClick={() => handle("drive-up", async () => {
              const snapshot = mindmap.getFullSnapshot();
              if (!shouldAllowCloudSave(snapshot)) {
                toast.error("Varsayılan boş veri buluta yazılmadı. Önce buluttan geri yükle.");
                return;
              }
              const json = JSON.stringify(snapshot);
              const r = await driveSaveSnapshot({ data: { json } });
              localStorage.setItem("mintmap.drive.savedAt", String(r.savedAt));
              toast.success(`Buluta yedeklendi (${describeStoreSnapshot(snapshot)})`);
            })}
          >
            <CloudUpload className="mr-2 h-4 w-4" /> Şimdi buluta yedekle
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={busy === "drive-dn"}
            onClick={() => handle("drive-dn", async () => {
              const r = await driveLoadSnapshot();
              if (!r.json) {
                toast.error("Bulutta yedek bulunamadı");
                return;
              }
              const parsed = JSON.parse(r.json);
              const backup = readBackupPayload(parsed);
              if (backup.isDefaultSeed) {
                toast.error("Buluttaki yedek varsayılan boş veri. Telefonda sayfayı yenileyip tekrar buluta yedekle.");
                return;
              }
              if (backup.kind === "legacy") mindmap.importSnapshot(backup.nodes);
              else mindmap.importFullSnapshot(backup.store);
              toast.success(`Buluttan geri yüklendi (${backup.summary})`);
            })}
          >
            <CloudDownload className="mr-2 h-4 w-4" /> Buluttan geri yükle
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Drive bağlantısı kuruluysa otomatik olarak her 5 dakikada bir yedek alınır.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            <CalendarSync className="inline h-3 w-3 mr-1" /> Google Takvim (2 yönlü)
          </h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={calAuto}
              onChange={(e) => {
                setCalAuto(e.target.checked);
                localStorage.setItem("mintmap.calendar.auto", e.target.checked ? "on" : "off");
              }}
            />
            Otomatik senkron (15 dk)
          </label>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={busy === "cal"}
            onClick={async () => {
              setBusy("cal");
              try {
                const r = await runCalendarSync();
                setCalLast(Date.now());
                toast.success(`Senkron: ${r.pushed} yollandı, ${r.pulled} güncellendi${r.errors ? `, ${r.errors} hata` : ""}`);
              } catch (e) {
                toast.error("Takvim senkron başarısız: " + (e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          >
            <CalendarSync className="mr-2 h-4 w-4" /> Şimdi senkronize et
          </Button>
          {calLast ? (
            <p className="text-[11px] text-muted-foreground">Son senkron: {new Date(calLast).toLocaleString()}</p>
          ) : null}
        </section>



        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            <Keyboard className="inline h-3 w-3 mr-1" /> Kısayollar
          </h3>
          <ul className="text-xs space-y-1">
            {SHORTCUTS.map(([k, d]) => (
              <li key={k} className="flex justify-between">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{k}</kbd>
                <span className="text-muted-foreground">{d}</span>
              </li>
            ))}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
