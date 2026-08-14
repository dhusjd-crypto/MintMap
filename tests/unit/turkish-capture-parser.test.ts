import { describe, expect, it } from "vitest";
import { parseTurkishCapture } from "@/capture/turkish-task-parser";

const config = {
  now: Date.UTC(2026, 7, 14, 8),
  timezone: "Europe/Istanbul",
  projects: [{ id: "eser-1", title: "Eser" }],
};
describe("Turkish capture parser v1", () => {
  it("keeps planning time distinct from deadline and extracts tokens", () => {
    const result = parseTurkishCapture("yarın 10'da Ahmet'i ara 20dk #Eser !kritik", config);
    expect(result.fields.title).toBe("Ahmet'i ara");
    expect(result.fields.doAt).toBeDefined();
    expect(result.fields.dueAt).toBeUndefined();
    expect(result.fields.estimatedMinutes).toBe(20);
    expect(result.fields.priority).toBe(1);
    expect(result.fields.projectId).toBe("eser-1");
  });
  it("only creates a hard deadline with explicit deadline language", () => {
    expect(parseTurkishCapture("yarın Ahmet'i ara", config).fields.dueAt).toBeUndefined();
    expect(parseTurkishCapture("cuma en geç raporu gönder", config).fields.dueAt).toBeDefined();
  });
  it("supports waiting, follow-up, reminders and durations", () => {
    const waiting = parseTurkishCapture("Ahmet'ten teklif bekliyorum cuma takip et", config);
    expect(waiting.proposalType).toBe("WAITING_TASK");
    expect(waiting.fields.waitingFor).toContain("Ahmet'ten teklif");
    expect(waiting.fields.followUpAt).toBeDefined();
    expect(parseTurkishCapture("2 saat sonra hatırlat", config).fields.remindAt).toBe(
      config.now + 7_200_000,
    );
    expect(
      parseTurkishCapture("pazartesi vergi dosyasını kontrol et 1 saat 30 dk", config).fields
        .estimatedMinutes,
    ).toBe(90);
  });
  it("uses visible defaults for dayparts", () => {
    const result = parseTurkishCapture("yarın sabah ara", config);
    expect(result.fields.doAt).toBeDefined();
    expect(result.warnings).toContain("TIME_INFERRED_FROM_DAYPART");
  });
});
