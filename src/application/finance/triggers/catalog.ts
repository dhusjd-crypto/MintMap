import type { FinanceNotificationPreset, FinanceTriggerId, FinanceTriggerSeverity } from "./types";
export const FINANCE_TRIGGER_CATALOG: Record<
  FinanceTriggerId,
  { name: string; severity: FinanceTriggerSeverity; preset?: FinanceNotificationPreset }
> = {
  "FIN-T01": { name: "Ödeme 7 gün içinde", severity: "ATTENTION", preset: "PAYMENT_STANDARD" },
  "FIN-T02": { name: "Ödeme 3 gün içinde", severity: "HIGH", preset: "PAYMENT_IMPORTANT" },
  "FIN-T03": { name: "Ödeme yarın", severity: "HIGH", preset: "PAYMENT_IMPORTANT" },
  "FIN-T04": { name: "Ödeme bugün", severity: "CRITICAL", preset: "PAYMENT_CRITICAL" },
  "FIN-T05": { name: "Ödeme saatler içinde", severity: "CRITICAL", preset: "PAYMENT_CRITICAL" },
  "FIN-T06": { name: "Ödeme gecikmiş", severity: "CRITICAL", preset: "PAYMENT_CRITICAL" },
  "FIN-T07": { name: "Ekstre gözden geçirilmeli", severity: "ATTENTION" },
  "FIN-T08": {
    name: "Ekstre için borç oluşturulmalı",
    severity: "HIGH",
    preset: "PAYMENT_IMPORTANT",
  },
  "FIN-T09": { name: "Asgari ödeme mevcut", severity: "ATTENTION", preset: "PAYMENT_STANDARD" },
  "FIN-T10": {
    name: "Zamanlanan ödeme teyit bekliyor",
    severity: "HIGH",
    preset: "PAYMENT_IMPORTANT",
  },
  "FIN-T11": { name: "Tekrarlayan ödeme üretildi", severity: "INFO" },
  "FIN-T12": { name: "Tekrarlayan ödeme eksik", severity: "ATTENTION" },
  "FIN-T13": {
    name: "7 günlük yüksek nakit gereksinimi",
    severity: "HIGH",
    preset: "PAYMENT_IMPORTANT",
  },
  "FIN-T14": {
    name: "30 günlük yüksek nakit gereksinimi",
    severity: "HIGH",
    preset: "PAYMENT_IMPORTANT",
  },
  "FIN-T15": { name: "Beklenen nakit açığı", severity: "HIGH", preset: "PAYMENT_IMPORTANT" },
  "FIN-T16": {
    name: "Tekrarlanan hatırlatmaya rağmen ödenmedi",
    severity: "CRITICAL",
    preset: "PAYMENT_CRITICAL",
  },
  "FIN-T17": { name: "Vergi / SGK ödemesi", severity: "HIGH", preset: "PAYMENT_IMPORTANT" },
  "FIN-T18": { name: "Tedarikçi ödemesi", severity: "HIGH", preset: "PAYMENT_IMPORTANT" },
  "FIN-T19": { name: "Kredi taksiti", severity: "HIGH", preset: "PAYMENT_IMPORTANT" },
  "FIN-T20": {
    name: "Abonelik gözden geçirilmeli",
    severity: "ATTENTION",
    preset: "PAYMENT_STANDARD",
  },
};
