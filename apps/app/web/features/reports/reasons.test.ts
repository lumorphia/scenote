import { describe, expect, it } from "vitest";
import { reportReasonLabel } from "./reasons.ts";

describe("reportReasonLabel", () => {
  it.each([
    ["rights", "権利侵害"],
    ["depicted", "写り込んだ本人からの削除依頼"],
    ["terms", "規約違反"],
  ] as const)("names the reason %s", (value, label) => {
    expect(reportReasonLabel(value)).toBe(label);
  });
});
