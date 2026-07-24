import { useEffect, useRef } from "react";
import { shouldAllowCloudSave } from "./backup-format";
import { createDriveBackup } from "./drive-backup";
import { driveSaveSnapshot } from "./google/drive";
import { hasGoogleGrant, isGoogleConfigured } from "./google/gauth";

const KEY = "mintmap.drive.savedAt";
const ENABLED_KEY = "mintmap.drive.auto";
const INTERVAL = 5 * 60_000;

export function useAutoDriveBackup() {
  const last = useRef<number>(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const enabled = localStorage.getItem(ENABLED_KEY) !== "off";
    // Never open a Google popup from a background timer. The user connects once
    // from Settings; subsequent 5-minute snapshots refresh silently.
    if (!enabled || !isGoogleConfigured() || !hasGoogleGrant()) return;
    const saved = Number(localStorage.getItem(KEY) || 0);
    last.current = saved;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - last.current < INTERVAL) return;
      try {
        const snapshot = await createDriveBackup();
        if (!shouldAllowCloudSave(snapshot.store)) {
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
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    // Do not wait five minutes after launching the app when the prior backup
    // is already stale.
    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
