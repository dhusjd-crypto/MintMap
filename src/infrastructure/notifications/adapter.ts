import type { NotificationCapabilities, NotificationIntent } from "@/domain/notification";

export type NotificationAdapter = {
  getCapabilities(): NotificationCapabilities;
  requestPermission(): Promise<boolean>;
  schedule(intent: NotificationIntent): Promise<void>;
  cancel(notificationId: string): Promise<void>;
  cancelByEntity(entityType: string, entityId: string): Promise<void>;
  update(intent: NotificationIntent): Promise<void>;
  listScheduled(): Promise<readonly NotificationIntent[]>;
};
