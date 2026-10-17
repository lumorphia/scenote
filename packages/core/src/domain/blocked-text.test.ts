import { describe, expect, it } from "vitest";
import { BLOCKED_TERMS } from "@lumorphia/moderation/text";
import { findBlockedText } from "./blocked-text.ts";

// NG 語 (docs/plan.md の S5g、ADR-0015)。語はリポジトリに書かず、パッケージの一覧から取る (ADR-0007)
const word = BLOCKED_TERMS.find((t) => t.match === "contains")!.term;
/** 全角にして前後に文字を足す (正規化と部分一致で当たる) */
const wrapped = `テスト_${word.normalize("NFKC").replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0))}_文`;

describe("findBlockedText", () => {
  it("finds nothing in ordinary words", () => {
    expect(
      findBlockedText({
        title: "テスト_夕焼け",
        body: "テスト_本文",
        tags: ["テスト_海"],
        placeText: "テスト_浜辺",
      }),
    ).toBeNull();
  });

  it("finds a blocked word in the title", () => {
    expect(findBlockedText({ title: wrapped })).toBe("title");
  });

  it("finds a blocked word in the body", () => {
    expect(findBlockedText({ body: wrapped })).toBe("body");
  });

  it("finds a blocked word in a tag", () => {
    expect(findBlockedText({ tags: ["テスト_海", wrapped] })).toBe("tags");
  });

  it("finds a blocked word in a place the user wrote", () => {
    expect(findBlockedText({ placeText: wrapped })).toBe("placeText");
  });

  it("ignores fields that are missing or empty", () => {
    expect(findBlockedText({ title: null, body: "", tags: [], placeText: null })).toBeNull();
  });
});
