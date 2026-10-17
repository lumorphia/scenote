import type { PostShareMeta } from "./server-context.ts";

const DESCRIPTION_MAX = 120;
const OGP_SIZE = { width: "1200", height: "630" };

type MetaDescriptor =
  { title: string } | { property: string; content: string } | { name: string; content: string };

/**
 * 投稿のページの meta (S6e、要件定義書 16 章)。共有できる投稿は写真を大きく (summary_large_image) 見せる。
 * 公開の投稿だけ検索エンジンに載せ、限定公開と、共有できない投稿 (非公開・保留など) は noindex。
 * エスケープは React Router の <Meta> に任せる
 */
export function postMeta(share: PostShareMeta | null, url: string): MetaDescriptor[] {
  if (!share) return [{ title: "投稿 - Scenote" }, { name: "robots", content: "noindex" }];
  const words = share.description?.replace(/\s+/g, " ").trim();
  const shortened = words
    ? [...words].slice(0, DESCRIPTION_MAX).join("")
    : `${share.author.name} (@${share.author.handle}) さんの写真 - Scenote`;
  return [
    { title: `${share.title} - Scenote` },
    ...(share.visibility === "unlisted" ? [{ name: "robots", content: "noindex" }] : []),
    { name: "description", content: shortened },
    { property: "og:site_name", content: "Scenote" },
    { property: "og:type", content: "article" },
    { property: "og:url", content: url },
    { property: "og:title", content: share.title },
    { property: "og:description", content: shortened },
    { property: "og:image", content: share.image },
    { property: "og:image:type", content: "image/jpeg" },
    { property: "og:image:width", content: OGP_SIZE.width },
    { property: "og:image:height", content: OGP_SIZE.height },
    { property: "og:image:alt", content: share.title },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: share.title },
    { name: "twitter:description", content: shortened },
    { name: "twitter:image", content: share.image },
  ];
}
