import { describe, expect, it } from "vitest";
import { columnCountFor, layoutColumns } from "./columns.ts";

// 一覧の並べ方 (S6a、ADR-0016)。縦横比を保ち、いちばん低い列に順に積む
const photo = (id: string, width: number, height: number) => ({ id, width, height });

describe("layoutColumns", () => {
  it("fills the columns left to right while they are even", () => {
    const columns = layoutColumns(
      [photo("a", 100, 100), photo("b", 100, 100), photo("c", 100, 100)],
      3,
    );
    expect(columns.map((c) => c.map((p) => p.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("puts the next photo under the lowest column", () => {
    const columns = layoutColumns(
      [photo("tall", 100, 300), photo("wide", 300, 100), photo("next", 100, 100)],
      2,
    );
    expect(columns.map((c) => c.map((p) => p.id))).toEqual([["tall"], ["wide", "next"]]);
  });

  it("keeps the earlier photos where they were when more are added", () => {
    const first = [photo("a", 100, 200), photo("b", 100, 100), photo("c", 100, 150)];
    const before = layoutColumns(first, 2);
    const after = layoutColumns([...first, photo("d", 100, 100), photo("e", 100, 100)], 2);
    expect(after.map((column, i) => column.slice(0, before[i]!.length))).toEqual(before);
  });

  it("gives as many columns as asked, even with fewer photos", () => {
    expect(layoutColumns([photo("a", 100, 100)], 3)).toHaveLength(3);
  });

  it("does not change the photos it is given", () => {
    const photos = Object.freeze([photo("a", 100, 100), photo("b", 100, 100)]);
    expect(() => layoutColumns(photos, 2)).not.toThrow();
  });
});

describe("columnCountFor", () => {
  it.each([
    [360, 2],
    [700, 3],
    [1100, 4],
    [1600, 5],
  ])("uses more columns on a wider screen (%i px -> %i)", (width, count) => {
    expect(columnCountFor(width)).toBe(count);
  });
});
