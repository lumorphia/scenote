import { describe, expect, it } from "vitest";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTag, validateTags } from "./tags.ts";

describe("normalizeTag", () => {
  it("evens out width and case, and keeps how it was written for display", () => {
    expect(normalizeTag("Ｎｉｇｈｔ ")).toEqual({ name: "night", displayName: "Ｎｉｇｈｔ" });
  });

  it("drops the leading # people write by habit", () => {
    expect(normalizeTag("#夕焼け")).toEqual({ name: "夕焼け", displayName: "夕焼け" });
    expect(normalizeTag("＃＃風景").name).toBe("風景");
  });

  it("removes control characters and folds spaces", () => {
    expect(normalizeTag("リム\u0000サ  ロミンサ").name).toBe("リムサ ロミンサ");
  });

  it("cuts a tag at the length limit", () => {
    expect([...normalizeTag("あ".repeat(MAX_TAG_LENGTH + 5)).displayName]).toHaveLength(
      MAX_TAG_LENGTH,
    );
  });
});

describe("validateTags", () => {
  it("treats spellings that normalize the same as one tag, keeping the first", () => {
    expect(validateTags(["Night", "#night", "ＮＩＧＨＴ"])).toEqual([
      { name: "night", displayName: "Night" },
    ]);
  });

  it("keeps the order the user wrote", () => {
    expect(validateTags(["夜景", "旅", "記念撮影"]).map((t) => t.name)).toEqual([
      "夜景",
      "旅",
      "記念撮影",
    ]);
  });

  it("ignores tags left empty", () => {
    expect(validateTags(["#", "  ", "旅"])).toEqual([{ name: "旅", displayName: "旅" }]);
  });

  it("refuses too many tags", () => {
    expect(() => validateTags(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`))).toThrow(
      expect.objectContaining({ code: "validation" }),
    );
  });
});
