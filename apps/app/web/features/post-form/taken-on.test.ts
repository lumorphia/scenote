import { describe, expect, it } from "vitest";
import { takenOnFrom } from "./taken-on.ts";

describe("takenOnFrom", () => {
  it("uses the day the file was last changed, in the viewer's own time", () => {
    const lateEvening = new Date(2026, 8, 30, 23, 30).getTime();
    expect(takenOnFrom(lateEvening)).toBe("2026-09-30");
  });

  it("pads the month and the day", () => {
    expect(takenOnFrom(new Date(2026, 0, 5, 12).getTime())).toBe("2026-01-05");
  });

  it("leaves the day empty when the file has no time", () => {
    expect(takenOnFrom(null)).toBe("");
  });
});
