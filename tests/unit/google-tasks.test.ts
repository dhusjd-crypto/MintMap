import { describe, expect, it } from "vitest";

import { googleTaskRemoteStatus, toGoogleTaskBody } from "@/lib/google/tasks";

describe("Google Tasks payload", () => {
  it("keeps MintMap task details and sends due dates as RFC3339", () => {
    expect(
      toGoogleTaskBody({
        key: "ws:node:todo",
        title: "Mimarla görüş",
        description: "İnşaat · görüşme notları",
        dueAt: Date.UTC(2026, 6, 24, 9, 30),
      }),
    ).toEqual({
      title: "Mimarla görüş",
      notes: "İnşaat · görüşme notları",
      due: "2026-07-24T09:30:00.000Z",
      status: "needsAction",
    });
  });

  it("marks completed MintMap tasks as completed remotely", () => {
    expect(toGoogleTaskBody({ key: "x", title: "Bitti", done: true })).toMatchObject({
      title: "Bitti",
      status: "completed",
    });
  });

  it("recognises remote completion and deleted tasks", () => {
    expect(googleTaskRemoteStatus({ status: "completed" })).toBe("completed");
    expect(googleTaskRemoteStatus({ status: "needsAction" })).toBe("needsAction");
    expect(googleTaskRemoteStatus({ deleted: true })).toBe("missing");
  });
});
