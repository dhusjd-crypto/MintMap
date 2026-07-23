import { readBackupPayload, type BackupPayload } from "./backup-format";
import { keep, type KeepCard } from "./keep-store";
import { mindmap } from "./mindmap-store";

export type DriveBackup = { version: 2; store: Awaited<ReturnType<typeof mindmap.getPortableSnapshot>>; keep: KeepCard[] };

export async function createDriveBackup(): Promise<DriveBackup> {
  return { version: 2, store: await mindmap.getPortableSnapshot(), keep: await keep.getPortableSnapshot() };
}

export async function restoreDriveBackup(parsed: unknown): Promise<BackupPayload> {
  const backup = readBackupPayload(parsed);
  if (backup.kind === "legacy") mindmap.importSnapshot(backup.nodes);
  else mindmap.importFullSnapshot(backup.store);
  const keepCards = (parsed as { keep?: unknown })?.keep;
  if (Array.isArray(keepCards)) await keep.importPortableSnapshot(keepCards as KeepCard[]);
  return backup;
}
