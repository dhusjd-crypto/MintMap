import type { NotificationCapabilities, NotificationIntent } from "@/domain/notification";
import type { NotificationAdapter } from "./adapter";

const BROWSER_CAPABILITIES: NotificationCapabilities = {
  supportsActions: false,
  supportsPersistent: false,
  supportsCritical: false,
  supportsScheduledDelivery: false,
  supportsDeepLink: true,
  supportsExactScheduling: false,
};

export class BrowserNotificationAdapter implements NotificationAdapter {
  private readonly scheduled = new Map<string, NotificationIntent>();
  getCapabilities() {
    return BROWSER_CAPABILITIES;
  }
  async requestPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    return (await Notification.requestPermission()) === "granted";
  }
  async schedule(intent: NotificationIntent) {
    this.scheduled.set(intent.id, structuredClone(intent));
    if (intent.scheduledFor === undefined || intent.scheduledFor <= Date.now()) this.show(intent);
  }
  async cancel(notificationId: string) {
    this.scheduled.delete(notificationId);
  }
  async cancelByEntity(entityType: string, entityId: string) {
    for (const intent of [...this.scheduled.values()])
      if (intent.entityType === entityType && intent.entityId === entityId)
        this.scheduled.delete(intent.id);
  }
  async update(intent: NotificationIntent) {
    await this.schedule(intent);
  }
  async listScheduled() {
    return [...this.scheduled.values()];
  }
  private show(intent: NotificationIntent) {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    const notification = new Notification(intent.title, {
      body: intent.body,
      tag: intent.dedupeKey,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    });
    notification.onclick = () => window.focus();
  }
}
