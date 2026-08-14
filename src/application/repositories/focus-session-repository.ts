import type { FocusSession } from "@/domain/focus";
import { canonicalStorage } from "@/lib/canonical-persistence/storage";
import type { CanonicalStorage, PersistenceEnvelope } from "@/lib/canonical-persistence/types";

function envelope(
  value: FocusSession,
  previous?: PersistenceEnvelope<FocusSession>,
): PersistenceEnvelope<FocusSession> {
  const now = Date.now();
  return {
    id: value.id,
    entityType: "FocusSession",
    schemaVersion: 1,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    payload: structuredClone(value),
  };
}

export class FocusSessionRepository {
  constructor(private readonly storage: CanonicalStorage = canonicalStorage) {}
  async get(id: string) {
    return (await this.storage.get<FocusSession>("focus_sessions", id))?.payload;
  }
  async list() {
    return (await this.storage.list<FocusSession>("focus_sessions")).map((item) => item.payload);
  }
  async save(session: FocusSession) {
    const previous = await this.storage.get<FocusSession>("focus_sessions", session.id);
    await this.storage.put("focus_sessions", envelope(session, previous));
  }
}
