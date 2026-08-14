import type { DomainEvent, DomainEventName } from "@/lib/architecture/domain-events";

export type DomainEventListener = (event: DomainEvent) => void;

export class LocalDomainEventDispatcher {
  private readonly listeners = new Map<DomainEventName | "*", Set<DomainEventListener>>();

  emit(event: DomainEvent): void {
    this.listeners.get(event.name)?.forEach((listener) => listener(event));
    this.listeners.get("*")?.forEach((listener) => listener(event));
  }

  subscribe(name: DomainEventName | "*", listener: DomainEventListener): () => void {
    const listeners = this.listeners.get(name) ?? new Set<DomainEventListener>();
    listeners.add(listener);
    this.listeners.set(name, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(name);
    };
  }
}
