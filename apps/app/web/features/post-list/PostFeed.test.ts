import { describe, expect, it } from "vitest";
import { postsUrl } from "./PostFeed.tsx";

describe("postsUrl", () => {
  it("asks for the first page with no filter", () => {
    expect(postsUrl({}, null)).toBe("/api/posts");
  });

  it("keeps the filter when it asks for the next page", () => {
    expect(postsUrl({ tag: "夕焼け" }, "test-cursor")).toBe(
      `/api/posts?tag=${encodeURIComponent("夕焼け")}&cursor=test-cursor`,
    );
  });
});
