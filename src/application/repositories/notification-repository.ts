import type { NotificationIntent, NotificationRecord } from "@/domain/notification";
import { canonicalStorage } from "@/lib/canonical-persistence/storage";
import type { CanonicalStorage, PersistenceEnvelope } from "@/lib/canonical-persistence/types";

type NotificationSchedule = {
  id: string;
  intentId: string;
  platformId?: string;
  status: string;
  updatedAt: number;
};
type NotificationStoreValue = NotificationIntent | NotificationRecord | NotificationSchedule;

function envelope<T>(
  entityType: string,
  value: T & { id: string },
  previous?: PersistenceEnvelope<T>,
) {
  const now = Date.now();
  return {
    id: value.id,
    entityType,
    schemaVersion: 1,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    payload: structuredClone(value),
  } satisfies PersistenceEnvelope<T>;
}

export class NotificationRepository {
  constructor(private readonly storage: CanonicalStorage = canonicalStorage) {}
  async listIntents() {
    return (await this.storage.list<NotificationIntent>("notification_intents")).map(
      (item) => item.payload,
    );
  }
  async saveIntent(intent: NotificationIntent) {
    const previous = await this.storage.get<NotificationIntent>("notification_intents", intent.id);
    await this.storage.put(
      "notification_intents",
      envelope("NotificationIntent", intent, previous),
    );
  }
  async removeIntent(id: string) {
    await this.storage.remove("notification_intents", id);
  }
  async listHistory() {
    return (await this.storage.list<NotificationRecord>("notification_history")).map(
      (item) => item.payload,
    );
  }
  async appendHistory(record: NotificationRecord) {
    await this.storage.put("notification_history", envelope("NotificationRecord", record));
  }
  async listSchedules() {
    return (await this.storage.list<NotificationSchedule>("notification_schedule")).map(
      (item) => item.payload,
    );
  }
  async saveSchedule(schedule: NotificationSchedule) {
    const previous = await this.storage.get<NotificationSchedule>(
      "notification_schedule",
      schedule.id,
    );
    await this.storage.put(
      "notification_schedule",
      envelope("NotificationSchedule", schedule, previous),
    );
  }
}
