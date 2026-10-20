import { describe, expect, it } from "vitest";
import { likePattern, MAX_SEARCH_WORDS, MAX_WORD_LENGTH, searchWords } from "./search-words.ts";

// 検索の言葉 (docs/plan.md の S6f、ADR-0028)
describe("searchWords", () => {
  it("splits the words on spaces, including full-width ones", () => {
    expect(searchWords("夕焼け　海  ラベンダー")).toEqual(["夕焼け", "海", "ラベンダー"]);
  });

  it("evens out width and case the way tags are stored", () => {
    expect(searchWords("ＧＯＬＤ Saucer")).toEqual(["gold", "saucer"]);
  });

  it("drops the # people write before a tag", () => {
    expect(searchWords("#夕焼け ＃海")).toEqual(["夕焼け", "海"]);
  });

  it("keeps each word once", () => {
    expect(searchWords("海 海 うみ")).toEqual(["海", "うみ"]);
  });

  it("finds no words in blank input", () => {
    expect(searchWords(" \t#  ")).toEqual([]);
  });

  it("limits the number and the length of the words", () => {
    const many = Array.from({ length: MAX_SEARCH_WORDS + 3 }, (_, i) => `w${i}`).join(" ");
    expect(searchWords(many)).toHaveLength(MAX_SEARCH_WORDS);
    expect(searchWords("あ".repeat(MAX_WORD_LENGTH + 10))[0]).toHaveLength(MAX_WORD_LENGTH);
  });

  it("removes control characters", () => {
    expect(searchWords("夕\u0000焼け")).toEqual(["夕焼け"]);
  });
});

describe("likePattern", () => {
  it("looks for the word anywhere", () => {
    expect(likePattern("夕焼け")).toBe("%夕焼け%");
  });

  it("treats % and _ and the escape character as plain letters", () => {
    expect(likePattern("100%_\\")).toBe("%100\\%\\_\\\\%");
  });
});
