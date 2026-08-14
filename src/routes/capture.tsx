import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clipboard, FileUp, Mic, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNodes } from "@/lib/mindmap-store";
import { captureApplication } from "@/application/capture/capture-application";
import { validateCaptureFile } from "@/capture/file-capture";
import { createBrowserVoiceCapture } from "@/capture/adapters/browser-voice";
import type { CaptureItem, CaptureProposal } from "@/domain/capture";
import { toast } from "sonner";

export const Route = createFileRoute("/capture")({
  head: () => ({ meta: [{ title: "Hızlı Yakala — MintMap" }] }),
  component: CapturePage,
});

function CapturePage() {
  const nodes = useNodes();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<{ item: CaptureItem; proposal: CaptureProposal }>();
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const voice = useMemo(() => createBrowserVoiceCapture(), []);
  const refresh = () => captureApplication.repository.listItems().then(setItems);
  useEffect(() => {
    void refresh();
  }, []);
  const parse = async (value = text) => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      setDraft(await captureApplication.textCapture(value));
      setText("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yakalama başarısız");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!draft || !nodes[0]) {
      toast.error("Önce bir Mind Map düğümü oluşturmalısın.");
      return;
    }
    setBusy(true);
    try {
      await captureApplication.confirmCapture(draft.item.id, draft.proposal.id, nodes[0].id);
      setDraft(undefined);
      await refresh();
      toast.success("Görev kaydedildi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görev oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };
  const clipboard = async () => {
    try {
      const value = await navigator.clipboard.readText();
      await parse(value);
    } catch {
      toast.error("Panoya erişim için bu düğmeye kullanıcı olarak basmalısın.");
    }
  };
  const file = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const valid = validateCaptureFile(selected);
    if (!valid.ok) {
      toast.error(`Dosya alınamadı: ${valid.reason}`);
      return;
    }
    await captureApplication.fileCapture(
      selected,
      selected.type.startsWith("image/")
        ? "IMAGE"
        : selected.type === "application/pdf"
          ? "PDF"
          : "OTHER",
    );
    await refresh();
    toast.success("Dosya gelen kutusuna alındı");
  };
  const toggleVoice = () => {
    if (recording) {
      voice.stop();
      setRecording(false);
      return;
    }
    if (!voice.capability().supported) {
      toast.error("Bu tarayıcı sesli giriş desteklemiyor.");
      return;
    }
    voice.start(
      (transcript) => {
        setRecording(false);
        setText(transcript);
        void parse(transcript);
      },
      (message) => {
        setRecording(false);
        toast.error(message);
      },
    );
    setRecording(true);
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("capture-input")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <div className="min-h-dvh bg-background px-4 py-6 pb-24 text-foreground">
      <main className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              MintMap
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Hızlı yakala</h1>
            <p className="text-sm text-muted-foreground">
              Aklındaki şeyi önce yakala, ayrıntıyı sonra netleştir.
            </p>
          </div>
          <Link to="/command-center" className="text-sm text-muted-foreground">
            Komuta merkezine dön
          </Link>
        </header>
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex gap-2">
            <input
              id="capture-input"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void parse();
              }}
              placeholder="Yarın 10'da Ahmet'i ara 20dk #Eser !kritik"
              className="min-w-0 flex-1 rounded-xl border bg-background px-4 py-3 outline-none ring-primary focus:ring-2"
            />
            <Button
              onClick={() => void parse()}
              disabled={busy || !text.trim()}
              aria-label="Yakalamayı ayrıştır"
            >
              <Send />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void clipboard()}>
              <Clipboard /> Panodan al
            </Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-medium">
              <FileUp className="h-4 w-4" /> Dosya ekle
              <input type="file" className="hidden" onChange={(e) => void file(e)} />
            </label>
            <Button variant="ghost" onClick={toggleVoice}>
              <Mic /> {recording ? "Durdur" : "Ses"}
            </Button>
          </div>
        </section>
        {draft && (
          <section className="rounded-2xl border border-primary/30 bg-primary/[0.05] p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Öneri</p>
                <h2 className="mt-1 text-lg font-semibold">{draft.proposal.fields.title}</h2>
              </div>
              <button onClick={() => setDraft(undefined)} aria-label="Öneriyi kapat">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
              {draft.proposal.fields.doAt && (
                <span>
                  Planlanan zaman: {new Date(draft.proposal.fields.doAt).toLocaleString("tr-TR")}
                </span>
              )}
              {draft.proposal.fields.dueAt && (
                <span>
                  Son tarih: {new Date(draft.proposal.fields.dueAt).toLocaleString("tr-TR")}
                </span>
              )}
              {draft.proposal.fields.estimatedMinutes && (
                <span>{draft.proposal.fields.estimatedMinutes} dk</span>
              )}
              {draft.proposal.fields.projectToken && (
                <span>#{draft.proposal.fields.projectToken}</span>
              )}
            </div>
            {draft.proposal.warnings.length > 0 && (
              <p className="mt-3 text-sm text-amber-700">
                Kontrol et: {draft.proposal.warnings.join(", ")}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button onClick={() => void confirm()} disabled={busy}>
                Göreve dönüştür
              </Button>
              <Button variant="ghost" onClick={() => setDraft(undefined)}>
                Şimdilik gelen kutusunda tut
              </Button>
            </div>
          </section>
        )}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Gelen kutusu</h2>
            <span className="text-sm text-muted-foreground">
              {items.filter((item) => item.status === "REVIEW_REQUIRED").length} incelenecek
            </span>
          </div>
          {items
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border bg-card p-3"
              >
                <div>
                  <p className="text-sm font-medium">{item.rawText ?? "Dosya yakalaması"}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.sourceType} · {item.status}
                  </p>
                </div>
                {item.status === "REVIEW_REQUIRED" && (
                  <div className="flex gap-2">
                    {["IMAGE", "SCREENSHOT", "PDF"].includes(item.sourceType) && (
                      <Link
                        to="/finance/review/$captureId"
                        params={{ captureId: item.id }}
                        className="rounded-md px-3 py-2 text-sm font-medium text-primary"
                      >
                        Finansta incele
                      </Link>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => void captureApplication.reject(item.id).then(refresh)}
                    >
                      Reddet
                    </Button>
                  </div>
                )}
              </div>
            ))}
          {items.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              Henüz yakalama yok.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
