import { describe, expect, it } from "vitest";
import {
  hasSearch,
  MAX_QUERY_LENGTH,
  MAX_SEARCH_TAGS,
  readSearch,
  searchHref,
  searchTitle,
} from "./search-params.ts";

const PLACE = "3f2b8c1e-6a4d-4e2f-9b1a-0c5d7e8f9a10";

// 写真を探すページ (/posts) の URL (S6f、ADR-0028。lumorphia/prismtone の /posts と同じ形)
describe("readSearch", () => {
  it("reads the words, the tags and the place", () => {
    const params = new URLSearchParams([
      ["q", " 夕焼け "],
      ["tag", "海"],
      ["tag", "旅"],
      ["place", PLACE],
    ]);
    expect(readSearch(params)).toEqual({ q: "夕焼け", tags: ["海", "旅"], placeId: PLACE });
  });

  it("leaves out what is blank", () => {
    expect(readSearch(new URLSearchParams({ q: "  ", tag: " ", place: "" }))).toEqual({
      tags: [],
    });
  });

  it("keeps each tag once and no more than a post can have", () => {
    const many = Array.from({ length: MAX_SEARCH_TAGS + 2 }, (_, i) => ["tag", `t${i}`]);
    const tags = readSearch(new URLSearchParams([["tag", "t0"], ...many])).tags;
    expect(tags).toHaveLength(MAX_SEARCH_TAGS);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("ignores a place that is not an id, instead of failing the page", () => {
    expect(readSearch(new URLSearchParams({ place: "not-a-uuid" }))).toEqual({ tags: [] });
  });

  it("cuts words that are longer than the API takes", () => {
    const q = readSearch(new URLSearchParams({ q: "あ".repeat(MAX_QUERY_LENGTH + 5) })).q;
    expect(q).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe("searchHref", () => {
  it("writes the search back into the URL of the page", () => {
    const tag = (t: string) => `tag=${encodeURIComponent(t)}`;
    expect(searchHref({ q: "夕焼け", tags: ["海", "旅"], placeId: PLACE })).toBe(
      `/posts?q=${encodeURIComponent("夕焼け")}&${tag("海")}&${tag("旅")}&place=${PLACE}`,
    );
  });

  it("is the bare page when nothing is searched", () => {
    expect(searchHref({ tags: [] })).toBe("/posts");
  });
});

describe("hasSearch", () => {
  it("is true with any condition", () => {
    expect(hasSearch({ tags: ["海"] })).toBe(true);
    expect(hasSearch({ tags: [], placeId: PLACE })).toBe(true);
  });

  it("is false without conditions", () => {
    expect(hasSearch({ tags: [] })).toBe(false);
  });
});

describe("searchTitle", () => {
  it("names the words in the title", () => {
    expect(searchTitle({ q: "夕焼け", tags: [] })).toBe("「夕焼け」の検索 - Scenote");
  });

  it("is plain without words", () => {
    expect(searchTitle({ tags: ["海"] })).toBe("写真を探す - Scenote");
  });
});
