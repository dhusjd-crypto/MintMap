export type FocusMode = "FLOW" | "COUNTDOWN" | "POMODORO";
export type FocusSessionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type FocusInterruptionReason = "TASK_SWITCH" | "MEETING" | "USER_PAUSE" | "OTHER";

export type FocusSession = {
  id: string;
  taskId: string;
  mode: FocusMode;
  startedAt: number;
  lastResumedAt: number;
  pausedAt?: number;
  endedAt?: number;
  plannedMinutes?: number;
  accumulatedActiveMs: number;
  status: FocusSessionStatus;
  interruptionReason?: FocusInterruptionReason;
  staleRecoveryRequired?: boolean;
  createdAt: number;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};

export function elapsedActiveMs(session: FocusSession, now: number) {
  const running = session.status === "ACTIVE" ? Math.max(0, now - session.lastResumedAt) : 0;
  return session.accumulatedActiveMs + running;
}
export function remainingMinutes(session: FocusSession, now: number) {
  if (session.plannedMinutes === undefined) return undefined;
  return Math.max(0, session.plannedMinutes - Math.floor(elapsedActiveMs(session, now) / 60_000));
}
