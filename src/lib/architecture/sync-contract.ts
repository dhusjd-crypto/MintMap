export type SyncableEntityMetadata = {
  entityType: string;
  entityId: string;
  updatedAt?: number;
  deletedAt?: number;
  revision?: number;
  syncProtocolVersion: 1;
};

export type SyncConflict<T = unknown> = {
  entity: SyncableEntityMetadata;
  local: T;
  remote: T;
  reason: "updated-both" | "deleted-vs-updated" | "incompatible-version";
};

export type SyncResult<TSnapshot> = {
  snapshot: TSnapshot;
  conflicts: SyncConflict[];
  applied: number;
  ignored: number;
};

/** Future sync boundary; current Cloudflare adapter remains unchanged. */
export type VersionedSyncAdapter<TSnapshot> = {
  protocolVersion: 1;
  pull(): Promise<TSnapshot | null>;
  push(snapshot: TSnapshot): Promise<SyncResult<TSnapshot>>;
};
