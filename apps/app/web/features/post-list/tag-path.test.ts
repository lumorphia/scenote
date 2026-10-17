import { describe, expect, it } from "vitest";
import { tagPath } from "./tag-path.ts";

describe("tagPath", () => {
  it("leads to the tag's page without the leading #", () => {
    expect(tagPath(" #夕焼け ")).toBe(`/tags/${encodeURIComponent("夕焼け")}`);
  });

  it("goes nowhere for an empty tag", () => {
    expect(tagPath(" # ")).toBeNull();
  });
});
