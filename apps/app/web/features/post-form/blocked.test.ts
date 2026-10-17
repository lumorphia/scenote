import { describe, expect, it } from "vitest";
import { blockedFieldMessage, blockedFieldOf } from "./blocked.ts";

// NG 語に当たった欄の案内 (ADR-0015)。語そのものはサーバーも返さない
describe("blockedFieldOf", () => {
  it("reads the field from the error's issues", () => {
    expect(
      blockedFieldOf({
        error: { code: "validation", message: "x", issues: [{ path: "tags", message: "x" }] },
      }),
    ).toBe("tags");
  });

  it("ignores issues that are not about a field it knows", () => {
    expect(
      blockedFieldOf({
        error: { code: "validation", message: "x", issues: [{ path: "/uploadId", message: "x" }] },
      }),
    ).toBeNull();
  });

  it("ignores an answer that is not an error", () => {
    expect(blockedFieldOf(null)).toBeNull();
  });
});

describe("blockedFieldMessage", () => {
  it.each([
    ["title", /タイトル/],
    ["body", /ひとこと/],
    ["tags", /タグ/],
    ["placeText", /撮影場所/],
  ] as const)("names %s in words the user sees on the form", (field, pattern) => {
    expect(blockedFieldMessage(field)).toMatch(pattern);
  });
});
