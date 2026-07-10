import { Suspense, lazy, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, MessageSquare, Mic, Settings, Sparkles, X, Zap } from "lucide-react";
import { useAutoDriveBackup } from "@/lib/drive-auto";
import { useAutoCalendarSync } from "@/lib/calendar-sync";
import { useFabSlot } from "@/lib/fab-slots";

const AIChat = lazy(() => import("./AIChat").then((m) => ({ default: m.AIChat })));
const QuickCapture = lazy(() => import("./QuickCapture").then((m) => ({ default: m.QuickCapture })));
const VoiceCapture = lazy(() => import("./VoiceCapture").then((m) => ({ default: m.VoiceCapture })));
const SettingsDialog = lazy(() => import("./SettingsDialog").then((m) => ({ default: m.SettingsDialog })));
const RemindersScreen = lazy(() => import("./RemindersScreen").then((m) => ({ default: m.RemindersScreen })));

export function AILauncher() {
  const [menu, setMenu] = useState(false);
  const [chat, setChat] = useState(false);
  const [capture, setCapture] = useState(false);
  const [voice, setVoice] = useState(false);
  const [settings, setSettings] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>();
  useAutoDriveBackup();
  useEffect(() => { useAutoCalendarSync(); }, []);

  // Right side, priority 2. When the menu popover is open the slot
  // reports its FULL height (button + popover) so Pomodoro stacks
  // ABOVE the open menu instead of being hidden behind it.
  // 48 = button height, 8 = gap to popover, 196 = popover (~5 items × 36 + padding).
  const slot = useFabSlot({
    id: "ai-launcher",
    preferredSide: "right",
    height: menu ? 48 + 8 + 196 : 48,
    width: 192,
    priority: 2,
    expanded: menu,
  });


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inEditor =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (inEditor) return;
      if (e.key === "Escape") {
        // Close the quick-actions popover on Escape (Pomodoro panel
        // and modal dialogs handle their own dismiss).
        setMenu(false);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setSettings((v) => !v);
      } else if ((e.key === "m" || e.key === "M") && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setVoice((v) => !v);
      } else if ((e.key === "r" || e.key === "R") && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setReminders((v) => !v);
      }

    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sideClass = slot.side === "right" ? "right-4" : "left-4";
  const menuAlignClass = slot.side === "right" ? "right-0" : "left-0";

  return (
    <>
      <div
        data-fab-id="ai-launcher"
        data-fab-side={slot.side}
        className={`layer-fab fixed ${sideClass}`}
        style={{ bottom: `calc(${slot.bottom}px + env(safe-area-inset-bottom))` }}
      >
        <div className="relative">
          <AnimatePresence>
            {menu && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                id="ai-launcher-menu"
                role="menu"
                aria-label="AI hızlı eylemler"
                data-testid="fab-ai-menu"
                className={`layer-popover absolute bottom-14 ${menuAlignClass} w-48 overflow-hidden rounded-2xl bg-card p-1 shadow-leaf`}
              >
                <button
                  onClick={() => {
                    setMenu(false);
                    setCapture(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Zap className="h-4 w-4 text-amber-500" />
                  Hızlı yakala
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    setVoice(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Mic className="h-4 w-4 text-rose-500" />
                  Sesli görev
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    setChat(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <MessageSquare className="h-4 w-4 text-primary" />
                  AI sohbet
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    setReminders(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <BellRing className="h-4 w-4 text-primary" />
                  Hatırlatmalar
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    setSettings(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Ayarlar & senkron
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setMenu((v) => !v)}
            aria-label="AI"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-controls="ai-launcher-menu"
            data-testid="fab-ai"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-leaf transition-transform active:scale-95"
          >
            {menu ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </button>
        </div>
      </div>


      <Suspense fallback={null}>
        {chat && (
          <AIChat
            open={chat}
            onClose={() => { setChat(false); setPendingPrompt(undefined); }}
            initialPrompt={pendingPrompt}
            autoSend={!!pendingPrompt}
          />
        )}
        {capture && <QuickCapture open={capture} onClose={() => setCapture(false)} />}
        {voice && (
          <VoiceCapture
            open={voice}
            onClose={() => setVoice(false)}
            onSubmit={(text) => {
              setPendingPrompt(text);
              setChat(true);
            }}
          />
        )}
        {settings && <SettingsDialog open={settings} onOpenChange={setSettings} />}
        {reminders && <RemindersScreen open={reminders} onOpenChange={setReminders} />}
      </Suspense>
    </>
  );
}
