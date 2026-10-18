import { describe, expect, it } from "vitest";
import { selectHeroPosts } from "./hero.ts";

const photo = (id: string, width = 1600, height = 900) => ({ id, width, height });

describe("selectHeroPosts", () => {
  it("prefers landscape photos without changing the latest photos", () => {
    const photos = Object.freeze([
      photo("portrait", 900, 1600),
      photo("a"),
      photo("b"),
      photo("c"),
    ]);
    expect(selectHeroPosts(photos).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("fills the remaining pages with portraits when needed", () => {
    expect(selectHeroPosts([photo("p", 900, 1600), photo("a")]).map((p) => p.id)).toEqual([
      "a",
      "p",
    ]);
  });
  it("returns no photos for an empty journal", () => {
    expect(selectHeroPosts([])).toEqual([]);
  });
});
