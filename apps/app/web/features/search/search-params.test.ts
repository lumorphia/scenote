import { describe, expect, it } from "vitest";
import { MAX_QUERY_LENGTH, readSearch, searchHref, searchTitle } from "./search-params.ts";

const PLACE = "3f2b8c1e-6a4d-4e2f-9b1a-0c5d7e8f9a10";

// 検索のページの URL (S6f、ADR-0028)
describe("readSearch", () => {
  it("reads the words, the tag and the place", () => {
    expect(readSearch(new URLSearchParams({ q: " 夕焼け ", tag: "海", place: PLACE }))).toEqual({
      q: "夕焼け",
      tag: "海",
      placeId: PLACE,
    });
  });

  it("leaves out what is blank", () => {
    expect(readSearch(new URLSearchParams({ q: "  ", tag: "", place: "" }))).toEqual({});
  });

  it("ignores a place that is not an id, instead of failing the page", () => {
    expect(readSearch(new URLSearchParams({ place: "not-a-uuid" }))).toEqual({});
  });

  it("cuts words that are longer than the API takes", () => {
    const q = readSearch(new URLSearchParams({ q: "あ".repeat(MAX_QUERY_LENGTH + 5) })).q;
    expect(q).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe("searchHref", () => {
  it("writes the search back into the URL of the page", () => {
    expect(searchHref({ q: "夕焼け 海", placeId: PLACE })).toBe(
      `/search?q=${encodeURIComponent("夕焼け 海").replace(/%20/g, "+")}&place=${PLACE}`,
    );
  });

  it("is the bare page when nothing is searched", () => {
    expect(searchHref({})).toBe("/search");
  });
});

describe("searchTitle", () => {
  it("names the words in the title", () => {
    expect(searchTitle({ q: "夕焼け" })).toBe("「夕焼け」の写真 - Scenote");
  });

  it("names the tag when there are no words", () => {
    expect(searchTitle({ tag: "海" })).toBe("#海 の写真 - Scenote");
  });

  it("is plain without a search", () => {
    expect(searchTitle({})).toBe("写真を探す - Scenote");
  });
});
