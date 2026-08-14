import { systemClock, type Clock } from "@/lib/architecture/clock";
import { createFinancePersistence } from "@/lib/canonical-persistence/repositories";
import { evaluateFinanceTriggers, toFinanceAlertView } from "./evaluator";
import { generateRecurringObligations } from "./recurrence";
import {
  DEFAULT_FINANCE_TRIGGER_CONFIG,
  type FinanceNotificationHistorySummary,
  type FinanceTriggerConfig,
  type FinanceTriggerEvaluation,
} from "./types";
export function createFinanceTriggerApplication(
  deps: {
    persistence?: ReturnType<typeof createFinancePersistence>;
    clock?: Clock;
    config?: Partial<FinanceTriggerConfig>;
  } = {},
) {
  const persistence = deps.persistence ?? createFinancePersistence();
  const clock = deps.clock ?? systemClock;
  const config = { ...DEFAULT_FINANCE_TRIGGER_CONFIG, ...deps.config };
  return {
    async evaluate(
      financeBookId: string,
      history: readonly FinanceNotificationHistorySummary[] = [],
    ) {
      const [obligations, payments, statements, schedules] = await Promise.all([
        persistence.listObligations(financeBookId),
        persistence.listPayments(financeBookId),
        persistence.listStatements(financeBookId),
        persistence.repositories.schedules.list(),
      ]);
      const scopedSchedules = schedules.filter(
        (schedule) => schedule.financeBookId === financeBookId,
      );
      const recurring = generateRecurringObligations(
        scopedSchedules,
        obligations,
        clock.nowMs(),
        clock,
        config,
      );
      await Promise.all([
        ...recurring.created.map((item) => persistence.saveObligation(item)),
        ...recurring.updated.map((item) => persistence.saveSchedule(item)),
      ]);
      const evaluations = evaluateFinanceTriggers({
        financeBookId,
        now: clock.nowMs(),
        obligations: [...obligations, ...recurring.created],
        payments,
        statements,
        schedules: scopedSchedules,
        notificationHistory: history,
        config,
      });
      const generatedSignals: FinanceTriggerEvaluation[] = recurring.created.map((item) => ({
        triggerId: "FIN-T11",
        status: "TRIGGERED",
        severity: "INFO",
        financeBookId,
        entityType: "FINANCIAL_OBLIGATION",
        entityId: item.id,
        reasonCodes: ["RECURRING_OBLIGATION_GENERATED"],
        messageData: { occurrenceKey: String(item.metadata.recurrenceOccurrenceKey ?? "") },
        evaluatedAt: clock.nowMs(),
        suggestedActions: ["OPEN_OBLIGATION"],
      }));
      const all = [...evaluations, ...generatedSignals];
      return {
        evaluations: all,
        alerts: all
          .filter((item) => item.status === "TRIGGERED")
          .map((item) => toFinanceAlertView(item, config.privacyMode)),
        generated: recurring.created,
      };
    },
  };
}
export const financeTriggerApplication = createFinanceTriggerApplication();
