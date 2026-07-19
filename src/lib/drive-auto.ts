import { useEffect, useRef } from "react";
import { shouldAllowCloudSave } from "./backup-format";
import { mindmap } from "./mindmap-store";
import { driveSaveSnapshot } from "./google/drive";

const KEY = "mintmap.drive.savedAt";
const ENABLED_KEY = "mintmap.drive.auto";
const INTERVAL = 5 * 60_000;

export function useAutoDriveBackup() {
  const last = useRef<number>(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const enabled = localStorage.getItem(ENABLED_KEY) !== "off";
    if (!enabled) return;
    const saved = Number(localStorage.getItem(KEY) || 0);
    last.current = saved;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - last.current < INTERVAL) return;
      try {
        const snapshot = mindmap.getFullSnapshot();
        if (!shouldAllowCloudSave(snapshot)) {
          last.current = Date.now();
          return;
        }
        const json = JSON.stringify(snapshot);
        const r = await driveSaveSnapshot({ data: { json } });
        last.current = r.savedAt;
        localStorage.setItem(KEY, String(r.savedAt));
      } catch {
        // Silent: connector may not be configured. Disable auto attempts
        // for this session to avoid spamming the gateway.
        cancelled = true;
      }
    };
    const id = window.setInterval(tick, INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
}
