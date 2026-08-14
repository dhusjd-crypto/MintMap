import type { NotificationCapabilities, NotificationIntent } from "@/domain/notification";
import type { NotificationAdapter } from "./adapter";

export const IN_MEMORY_NOTIFICATION_CAPABILITIES: NotificationCapabilities = {
  supportsActions: true,
  supportsPersistent: true,
  supportsCritical: true,
  supportsScheduledDelivery: true,
  supportsDeepLink: true,
  supportsExactScheduling: true,
};

export class InMemoryNotificationAdapter implements NotificationAdapter {
  readonly scheduled = new Map<string, NotificationIntent>();
  readonly cancelled: string[] = [];
  getCapabilities() {
    return IN_MEMORY_NOTIFICATION_CAPABILITIES;
  }
  async requestPermission() {
    return true;
  }
  async schedule(intent: NotificationIntent) {
    this.scheduled.set(intent.id, structuredClone(intent));
  }
  async cancel(notificationId: string) {
    this.scheduled.delete(notificationId);
    this.cancelled.push(notificationId);
  }
  async cancelByEntity(entityType: string, entityId: string) {
    for (const intent of [...this.scheduled.values()]) {
      if (intent.entityType === entityType && intent.entityId === entityId)
        await this.cancel(intent.id);
    }
  }
  async update(intent: NotificationIntent) {
    this.scheduled.set(intent.id, structuredClone(intent));
  }
  async listScheduled() {
    return [...this.scheduled.values()];
  }
}
