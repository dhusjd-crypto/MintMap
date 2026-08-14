import type { Clock } from "@/lib/architecture/clock";
import {
  elapsedActiveMs,
  type FocusInterruptionReason,
  type FocusMode,
  type FocusSession,
} from "@/domain/focus";
import { FocusSessionRepository } from "../repositories/focus-session-repository";

export type FocusServiceOptions = {
  repository?: FocusSessionRepository;
  clock: Clock;
  staleAfterMinutes?: number;
  idFactory?: () => string;
  onTimeRecorded?: (taskId: string, minutes: number) => Promise<void>;
};

export class FocusSessionService {
  private static sequence = 0;
  private readonly repository: FocusSessionRepository;
  private readonly staleAfterMinutes: number;
  private readonly idFactory: () => string;
  constructor(private readonly options: FocusServiceOptions) {
    this.repository = options.repository ?? new FocusSessionRepository();
    this.staleAfterMinutes = options.staleAfterMinutes ?? 8 * 60;
    this.idFactory =
      options.idFactory ??
      (() => `focus-${this.options.clock.nowMs()}-${++FocusSessionService.sequence}`);
  }
  async getActive() {
    return (await this.repository.list()).find(
      (session) => session.status === "ACTIVE" || session.status === "PAUSED",
    );
  }
  async start(taskId: string, mode: FocusMode, plannedMinutes?: number) {
    if (await this.getActive()) throw new Error("Önce mevcut odak oturumunu durdurun.");
    const now = this.options.clock.nowMs();
    const session: FocusSession = {
      id: this.idFactory(),
      taskId,
      mode,
      startedAt: now,
      lastResumedAt: now,
      plannedMinutes,
      accumulatedActiveMs: 0,
      status: "ACTIVE",
      createdAt: now,
    };
    await this.repository.save(session);
    return session;
  }
  async pause(reason: FocusInterruptionReason = "USER_PAUSE") {
    const session = await this.requireActive("Odak oturumu bulunamadı.");
    if (session.status === "PAUSED") return session;
    const now = this.options.clock.nowMs();
    const next: FocusSession = {
      ...session,
      status: "PAUSED",
      pausedAt: now,
      accumulatedActiveMs: elapsedActiveMs(session, now),
      interruptionReason: reason,
    };
    await this.repository.save(next);
    return next;
  }
  async resume() {
    const session = await this.requireActive("Devam edilecek odak oturumu bulunamadı.");
    if (session.status === "ACTIVE") return session;
    const now = this.options.clock.nowMs();
    const next: FocusSession = {
      ...session,
      status: "ACTIVE",
      lastResumedAt: now,
      pausedAt: undefined,
    };
    await this.repository.save(next);
    return next;
  }
  async complete() {
    const session = await this.requireActive("Tamamlanacak odak oturumu bulunamadı.");
    const now = this.options.clock.nowMs();
    const activeMs = elapsedActiveMs(session, now);
    const next: FocusSession = {
      ...session,
      status: "COMPLETED",
      endedAt: now,
      accumulatedActiveMs: activeMs,
      pausedAt: session.status === "PAUSED" ? session.pausedAt : undefined,
    };
    await this.repository.save(next);
    const minutes = Math.floor(activeMs / 60_000);
    if (minutes > 0) await this.options.onTimeRecorded?.(session.taskId, minutes);
    return next;
  }
  async cancel(reason: FocusInterruptionReason = "OTHER") {
    const session = await this.requireActive("İptal edilecek odak oturumu bulunamadı.");
    const now = this.options.clock.nowMs();
    const next: FocusSession = {
      ...session,
      status: "CANCELLED",
      endedAt: now,
      accumulatedActiveMs: elapsedActiveMs(session, now),
      interruptionReason: reason,
    };
    await this.repository.save(next);
    return next;
  }
  async recover() {
    const session = await this.getActive();
    if (!session || session.status !== "ACTIVE") return session;
    const now = this.options.clock.nowMs();
    if (elapsedActiveMs(session, now) <= this.staleAfterMinutes * 60_000) return session;
    const recovered: FocusSession = {
      ...session,
      status: "PAUSED",
      pausedAt: now,
      staleRecoveryRequired: true,
      interruptionReason: "OTHER",
    };
    await this.repository.save(recovered);
    return recovered;
  }
  private async requireActive(message: string) {
    const session = await this.getActive();
    if (!session) throw new Error(message);
    return session;
  }
}
