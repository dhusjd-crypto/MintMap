import { describe, expect, it } from "vitest";

import { parseQuickAdd } from "@/lib/nl-parser";

// Fixed reference point so weekday/relative-date maths is deterministic.
// 2026-07-20 is a Monday, 10:00 local time.
const NOW = new Date(2026, 6, 20, 10, 0, 0, 0);

const at = (ts: number | undefined) => new Date(ts!);

describe("parseQuickAdd — recurrence", () => {
  it.each([
    ["her gün koş", "daily"],
    ["günlük rapor", "daily"],
    ["her hafta toplantı", "weekly"],
    ["aylık kira", "monthly"],
  ])("reads %s as %s", (input, expected) => {
    expect(parseQuickAdd(input, NOW).recurrence).toBe(expected);
  });

  it("strips the recurrence words out of the task text", () => {
    expect(parseQuickAdd("her gün koş", NOW).text).toBe("koş");
  });

  it("leaves recurrence unset when no keyword is present", () => {
    expect(parseQuickAdd("koş", NOW).recurrence).toBeUndefined();
  });
});

describe("parseQuickAdd — priority and flags", () => {
  it("reads !2 as priority 2 and drops it from the text", () => {
    const r = parseQuickAdd("rapor yaz !2", NOW);
    expect(r.priority).toBe(2);
    expect(r.text).toBe("rapor yaz");
  });

  it("reads the p-form too", () => {
    expect(parseQuickAdd("rapor yaz p1", NOW).priority).toBe(1);
  });

  it("ignores out-of-range priorities", () => {
    expect(parseQuickAdd("rapor yaz p9", NOW).priority).toBeUndefined();
  });

  it("marks 'önemli' as starred", () => {
    const r = parseQuickAdd("önemli rapor", NOW);
    expect(r.starred).toBe(true);
    expect(r.text).toBe("rapor");
  });

  it("marks 'günüm' as my-day", () => {
    const r = parseQuickAdd("rapor günüm", NOW);
    expect(r.myDay).toBe(true);
    expect(r.text).toBe("rapor");
  });
});

describe("parseQuickAdd — tags", () => {
  it("collects hashtags, lowercases them, and removes them from the text", () => {
    const r = parseQuickAdd("rapor #İş #acil", NOW);
    expect(r.tags).toEqual(["iş", "acil"]);
    expect(r.text).toBe("rapor");
  });

  it("de-duplicates repeated tags", () => {
    expect(parseQuickAdd("rapor #iş #iş", NOW).tags).toEqual(["iş"]);
  });

  it("leaves tags unset when there are none", () => {
    expect(parseQuickAdd("rapor", NOW).tags).toBeUndefined();
  });
});

describe("parseQuickAdd — dates", () => {
  it("resolves 'yarın' to the next day, defaulting to 09:00", () => {
    const d = at(parseQuickAdd("yarın rapor", NOW).dueAt);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(9);
  });

  it("resolves 'bugün' to today", () => {
    expect(at(parseQuickAdd("bugün rapor", NOW).dueAt).getDate()).toBe(20);
  });

  it("resolves 'haftaya' to seven days out", () => {
    expect(at(parseQuickAdd("haftaya rapor", NOW).dueAt).getDate()).toBe(27);
  });

  it("resolves a weekday to the next occurrence", () => {
    // From Monday the 20th, "cuma" is the 24th.
    expect(at(parseQuickAdd("cuma rapor", NOW).dueAt).getDate()).toBe(24);
  });

  it("treats the same weekday as a week out, not today", () => {
    expect(at(parseQuickAdd("pazartesi rapor", NOW).dueAt).getDate()).toBe(27);
  });

  it("'gelecek cuma' skips a further week", () => {
    expect(at(parseQuickAdd("gelecek cuma rapor", NOW).dueAt).getDate()).toBe(31);
  });

  it("leaves dueAt unset when there is no date or time", () => {
    expect(parseQuickAdd("rapor yaz", NOW).dueAt).toBeUndefined();
  });
});

describe("parseQuickAdd — times", () => {
  it("reads 14:30 and sets a reminder alongside the due date", () => {
    const r = parseQuickAdd("yarın 14:30 rapor", NOW);
    const d = at(r.dueAt);
    expect([d.getHours(), d.getMinutes()]).toEqual([14, 30]);
    expect(r.reminderAt).toBe(r.dueAt);
  });

  it("reads the suffixed '9'da' form", () => {
    expect(at(parseQuickAdd("yarın 9'da rapor", NOW).dueAt).getHours()).toBe(9);
  });

  it("reads the 'saat 14' form", () => {
    expect(at(parseQuickAdd("yarın saat 14 rapor", NOW).dueAt).getHours()).toBe(14);
  });

  it("does not set a reminder when only a date was given", () => {
    expect(parseQuickAdd("yarın rapor", NOW).reminderAt).toBeUndefined();
  });

  it("leaves a bare number alone — it is part of the text, not a time", () => {
    const r = parseQuickAdd("3 litre su al", NOW);
    expect(r.dueAt).toBeUndefined();
    expect(r.text).toBe("3 litre su al");
  });
});

describe("parseQuickAdd — text handling", () => {
  it("combines several modifiers and leaves clean text", () => {
    const r = parseQuickAdd("yarın 14:30 rapor yaz #iş !1", NOW);
    expect(r.text).toBe("rapor yaz");
    expect(r.priority).toBe(1);
    expect(r.tags).toEqual(["iş"]);
    expect(at(r.dueAt).getHours()).toBe(14);
  });

  it("keeps the original input when every token was a modifier", () => {
    // Better a redundant title than an empty, unidentifiable task.
    expect(parseQuickAdd("yarın", NOW).text).toBe("yarın");
  });

  it("collapses the whitespace left behind by removed tokens", () => {
    expect(parseQuickAdd("rapor   #iş   yaz", NOW).text).toBe("rapor yaz");
  });
});
