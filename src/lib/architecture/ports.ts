import type { Clock } from "./clock";
import type { DomainEventSink } from "./domain-events";

/** Small ports used by future use-cases; current stores remain the adapters. */
export type Repository<T> = {
  get(id: string): T | undefined;
  list(): T[];
  save(value: T): void;
  remove(id: string): void;
};

export type NotificationAdapter = {
  notify(input: { title: string; body?: string; level: "NORMAL" | "PERSISTENT" | "CRITICAL" }): void;
};

export type SyncAdapter<TSnapshot> = {
  pull(): Promise<TSnapshot | null>;
  push(snapshot: TSnapshot): Promise<void>;
};

export type CalendarAdapter = {
  createOrUpdate(input: { taskId: string; title: string; startAt?: number; dueAt?: number }): Promise<string>;
};

export type AIAdapter = {
  propose(input: { instruction: string; context?: unknown }): Promise<unknown>;
};

export type ApplicationRuntime = {
  clock: Clock;
  events?: DomainEventSink;
};
