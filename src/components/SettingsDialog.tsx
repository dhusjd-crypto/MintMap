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

type ProviderPref = "auto" | "off" | "openrouter" | "gemini" | "openai" | "ollama" | "mock";
type AiInfo = {
  active: string;
  /** true → nothing configured; answers come from the demo provider. */
  demo: boolean;
  providers: Array<{ id: string; label: string; configured: boolean; model?: string; free?: boolean }>;
};

/** Where each provider's key comes from, shown when it isn't configured yet. */
const KEY_HINT: Record<string, { env: string; url?: string; note?: string }> = {
  openrouter: { env: "OPENROUTER_API_KEY", url: "https://openrouter.ai/keys", note: "Tek anahtar, çok model. Ücretsiz modeller var." },
  gemini: { env: "GEMINI_API_KEY", url: "https://aistudio.google.com/apikey", note: "Desteklenen bölgelerde ücretsiz katman. Limitler proje bazlı (RPM/TPM/RPD), günlük kota Pasifik saatiyle gece yarısı sıfırlanır." },
  openai: { env: "OPENAI_API_KEY", url: "https://platform.openai.com/api-keys" },
  ollama: { env: "OLLAMA_BASE_URL", note: "Yerel model, anahtar gerekmez. Örn: http://127.0.0.1:11434/v1" },
};

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
  const [aiInfo, setAiInfo] = useState<AiInfo>({
    active: "mock",
    demo: true,
    providers: [],
  });
  const [provider, setProvider] = useState<ProviderPref>(
    () => (typeof window !== "undefined" ? (localStorage.getItem("mintmap.ai.provider") as ProviderPref | null) ?? "auto" : "auto"),
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
    fetchStatus()
      .then((s) => setAiInfo({ active: s.active, demo: s.demo, providers: s.providers }))
      .catch(() => {});
    return () => { off(); };
  }, [fetchStatus]);

  const updateProvider = (v: ProviderPref) => {
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

  const activeProvider = aiInfo.providers.find(
    (p) => p.id === (provider === "auto" ? aiInfo.active : provider),
  );
  // Key hint: for a provider the user picked but hasn't configured — or, while
  // nothing is set up at all, nudge toward Gemini (free tier).
  const hintFor =
    provider !== "auto" && provider !== "off" && provider !== "mock"
      ? aiInfo.providers.find((p) => p.id === provider && !p.configured)
      : aiInfo.demo
        ? (aiInfo.providers.find((p) => p.id === "gemini") ?? aiInfo.providers[0])
        : undefined;

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
            {aiInfo.demo && provider !== "off" && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed">
                <p className="font-semibold">AI bağlantısı yapılmadı — demo cevap gösteriliyor</p>
                <p className="mt-0.5 text-muted-foreground">
                  Aşağıdan bir sağlayıcı seç ve anahtarını <code className="rounded bg-muted px-1">.env</code>{" "}
                  dosyasına ekle.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              {aiInfo.providers.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {p.configured ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{p.label}</span>
                    {p.free && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                        ücretsiz
                      </span>
                    )}
                    {aiInfo.active === p.id && !aiInfo.demo && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[9px] font-semibold text-primary-foreground">
                        aktif
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 text-[11px] font-semibold ${p.configured ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {p.configured ? "bağlı" : "bağlı değil"}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-muted-foreground">AI sağlayıcı</label>
              <select
                value={provider}
                onChange={(e) => updateProvider(e.target.value as ProviderPref)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="auto">Otomatik (bağlı olan ilk sağlayıcı)</option>
                <option value="off">Kapalı</option>
                {aiInfo.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.configured}>
                    {p.label}
                    {p.configured ? "" : " — anahtar yok"}
                  </option>
                ))}
                <option value="mock">Demo (test cevapları)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-muted-foreground">Model (opsiyonel)</label>
              {/* Free text: model ids differ per provider (gemini-2.5-flash,
                  openai/gpt-4o-mini, meta-llama/...:free …), so don't box it in. */}
              <input
                value={model}
                onChange={(e) => updateModel(e.target.value)}
                placeholder={activeProvider?.model || "Varsayılan"}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Boş bırak = sağlayıcının varsayılanı{activeProvider?.model ? ` (${activeProvider.model})` : ""}.
              </p>
            </div>
            {activeProvider?.free && !aiInfo.demo && (
              <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Ücretsiz katman — yoğunlukta “hız limiti” uyarısı alabilirsin. Gemini'de limitler proje bazlıdır
                (RPM/TPM/RPD) ve günlük kota Pasifik saatiyle gece yarısı sıfırlanır.
              </p>
            )}

            {hintFor && (
              <div className="rounded-md border border-border bg-background p-2.5 text-[11px] leading-relaxed">
                <p className="font-semibold">{hintFor.label} anahtarı nasıl eklenir</p>
                <p className="mt-0.5 text-muted-foreground">
                  Proje kökündeki <code className="rounded bg-muted px-1">.env</code> dosyasına ekle, sonra dev
                  sunucusunu yeniden başlat:
                </p>
                <pre className="mt-1 overflow-x-auto rounded bg-muted px-2 py-1 text-[10px]">
                  {KEY_HINT[hintFor.id]?.env}=…
                </pre>
                {KEY_HINT[hintFor.id]?.url && (
                  <p className="mt-1">
                    <a
                      href={KEY_HINT[hintFor.id]!.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      Anahtar al
                    </a>
                  </p>
                )}
                {KEY_HINT[hintFor.id]?.note && (
                  <p className="mt-1 text-muted-foreground">{KEY_HINT[hintFor.id]!.note}</p>
                )}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Anahtarlar sunucu tarafında tutulur, tarayıcıya gönderilmez. Yayında hosting'in “secrets / environment
              variables” bölümünü kullan.
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
