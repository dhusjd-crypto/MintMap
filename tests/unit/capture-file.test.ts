import { describe, expect, it } from "vitest";
import { validateCaptureFile } from "@/capture/file-capture";
describe("capture file validation", () => {
  it("accepts supported non-empty files", () =>
    expect(validateCaptureFile({ name: "a.pdf", type: "application/pdf", size: 10 }).ok).toBe(
      true,
    ));
  it("rejects unsupported, empty and oversized files", () => {
    expect(
      validateCaptureFile({ name: "a.exe", type: "application/octet-stream", size: 10 }).ok,
    ).toBe(false);
    expect(validateCaptureFile({ name: "a.pdf", type: "application/pdf", size: 0 }).ok).toBe(false);
    expect(validateCaptureFile({ name: "a.pdf", type: "application/pdf", size: 30 }, 20).ok).toBe(
      false,
    );
  });
});
