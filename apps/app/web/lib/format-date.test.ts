import { describe, expect, it } from "vitest";
import { formatDate, formatTakenOn } from "./format-date.ts";

// 日付の見せ方 (S6b)。投稿日は日本の日付、撮影日は書かれた日のまま
describe("formatDate", () => {
  it("shows the day in Japan", () => {
    expect(formatDate("2026-10-16T16:00:00.000Z")).toBe("2026年10月17日");
  });
});

describe("formatTakenOn", () => {
  it("shows the day as written, without shifting it by the time zone", () => {
    expect(formatTakenOn("2026-09-30")).toBe("2026年9月30日");
  });
});
