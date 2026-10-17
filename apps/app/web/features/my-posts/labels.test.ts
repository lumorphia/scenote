import { describe, expect, it } from "vitest";
import { statusLabel } from "./labels.ts";

// マイページの札 (S6d)。公開されたものには付けない
describe("statusLabel", () => {
  it.each([
    ["processing", "仕上げ中"],
    ["failed", "受け付けられませんでした"],
    ["held", "確認中"],
  ] as const)("names a post that is %s", (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });

  it("says nothing for a published post", () => {
    expect(statusLabel("published")).toBeNull();
  });
});
