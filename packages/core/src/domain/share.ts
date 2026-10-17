import { eq } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";
import { canView, imageUrl, type Visibility } from "./posts.ts";

export type PostShare = {
  title: string;
  description: string | null;
  /** 共有用の画像 (1200x630 の JPEG) の URL。配信元の URL のまま (絶対にするのは呼ぶ側) */
  image: string;
  author: { handle: string; name: string };
  visibility: Exclude<Visibility, "private">;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 投稿の OGP に使うもの (S6e、ADR-0018)。ログインしていない人に見える (canView) 公開・限定公開の投稿だけ。
 * それ以外 (非公開、保留、画像を作っている途中、退会中の人、無い投稿) は null で、OGP を出さない
 */
export async function getPostShare(
  { db, imageBaseUrl }: { db: Database; imageBaseUrl: string },
  postId: string,
): Promise<PostShare | null> {
  if (!UUID.test(postId)) return null;
  const [row] = await db
    .select({
      post: schema.posts,
      authorStatus: schema.users.status,
      handle: schema.users.handle,
      name: schema.users.name,
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(eq(schema.posts.id, postId));
  if (!row || !canView(row.post, row.authorStatus, null)) return null;
  const { post } = row;
  if (post.visibility === "private") return null;
  return {
    title: post.title ?? `${row.name} さんの写真`,
    description: post.body,
    image: imageUrl(post, imageBaseUrl, "ogp"),
    author: { handle: row.handle, name: row.name },
    visibility: post.visibility,
  };
}
