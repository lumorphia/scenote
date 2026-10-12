import { describe, expect, it } from "vitest";
import { addTag, MAX_TAGS } from "./tags.ts";

describe("addTag", () => {
  it("adds a tag without the # people type by habit", () => {
    expect(addTag(["夜景"], "#夕焼け")).toEqual(["夜景", "夕焼け"]);
  });

  it("does not add the same tag twice, whatever its width or case", () => {
    expect(addTag(["Night"], "ＮＩＧＨＴ")).toEqual(["Night"]);
  });

  it("ignores an empty entry", () => {
    expect(addTag(["旅"], "  # ")).toEqual(["旅"]);
  });

  it("stops at the limit", () => {
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    expect(addTag(full, "one-more")).toEqual(full);
  });

  it("cuts a long tag at 30 characters", () => {
    expect([...addTag([], "あ".repeat(40))[0]!]).toHaveLength(30);
  });
});
