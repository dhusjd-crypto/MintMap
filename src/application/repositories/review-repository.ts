import type { RolloverDecision, RoutineSession } from "@/domain/review";
import { canonicalStorage } from "@/lib/canonical-persistence/storage";
import type { CanonicalStorage, PersistenceEnvelope } from "@/lib/canonical-persistence/types";

const wrap = <T extends { id: string }>(
  value: T,
  previous?: PersistenceEnvelope<T>,
): PersistenceEnvelope<T> => ({
  id: value.id,
  entityType: value.constructor?.name ?? "ReviewRecord",
  schemaVersion: 1,
  revision: (previous?.revision ?? 0) + 1,
  createdAt: previous?.createdAt ?? Date.now(),
  updatedAt: Date.now(),
  payload: structuredClone(value),
});

export class ReviewRepository {
  constructor(private readonly storage: CanonicalStorage = canonicalStorage) {}
  async getSession(id: string) {
    return (await this.storage.get<RoutineSession>("routine_sessions", id))?.payload;
  }
  async listSessions() {
    return (await this.storage.list<RoutineSession>("routine_sessions")).map(
      (item) => item.payload,
    );
  }
  async saveSession(value: RoutineSession) {
    await this.storage.put(
      "routine_sessions",
      wrap(value, await this.storage.get("routine_sessions", value.id)),
    );
  }
  async saveRollover(value: RolloverDecision) {
    await this.storage.put(
      "rollover_decisions",
      wrap(value, await this.storage.get("rollover_decisions", value.id)),
    );
  }
  async listRollovers() {
    return (await this.storage.list<RolloverDecision>("rollover_decisions")).map(
      (item) => item.payload,
    );
  }
}
