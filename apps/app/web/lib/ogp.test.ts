import { describe, expect, it } from "vitest";
import { postMeta } from "./ogp.ts";

// 投稿の OGP と検索エンジン向けの meta (S6e、要件定義書 16 章)
const share = {
  title: "テスト_夕焼け",
  description: "テスト_本文",
  image: "https://img.example.invalid/posts/x/y/ogp.jpg",
  author: { handle: "test_user", name: "テスト_利用者" },
  visibility: "public" as const,
};
const url = "https://scenote.example.invalid/posts/x";
const find = (meta: ReturnType<typeof postMeta>, key: string) =>
  meta.find((m) => ("property" in m && m.property === key) || ("name" in m && m.name === key));

describe("postMeta", () => {
  it("shows the photo large when the URL is shared", () => {
    const meta = postMeta(share, url);
    expect(find(meta, "twitter:card")).toMatchObject({ content: "summary_large_image" });
    expect(find(meta, "og:image")).toMatchObject({ content: share.image });
    expect(find(meta, "og:image:width")).toMatchObject({ content: "1200" });
    expect(find(meta, "og:image:height")).toMatchObject({ content: "630" });
    expect(find(meta, "og:url")).toMatchObject({ content: url });
  });

  it("titles the page with the post and the site", () => {
    expect(postMeta(share, url)[0]).toEqual({ title: "テスト_夕焼け - Scenote" });
    expect(find(postMeta(share, url), "og:title")).toMatchObject({ content: "テスト_夕焼け" });
  });

  it("shortens a long description to one line", () => {
    const meta = postMeta({ ...share, description: `テスト\n${"あ".repeat(300)}` }, url);
    const content = (find(meta, "og:description") as { content: string }).content;
    expect(content).not.toContain("\n");
    expect([...content].length).toBeLessThanOrEqual(120);
  });

  it("describes a post with no words by its author", () => {
    const meta = postMeta({ ...share, description: null }, url);
    expect(find(meta, "og:description")).toMatchObject({
      content: "テスト_利用者 (@test_user) さんの写真 - Scenote",
    });
  });

  it("lets search engines index a public post", () => {
    expect(find(postMeta(share, url), "robots")).toBeUndefined();
  });

  it("keeps an unlisted post out of search engines", () => {
    expect(find(postMeta({ ...share, visibility: "unlisted" }, url), "robots")).toMatchObject({
      content: "noindex",
    });
  });

  it("shares nothing and keeps out of search engines when the post cannot be shared", () => {
    const meta = postMeta(null, url);
    expect(meta).toEqual([{ title: "投稿 - Scenote" }, { name: "robots", content: "noindex" }]);
  });
});
