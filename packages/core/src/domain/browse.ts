import { and, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";
import { DomainError } from "./errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { imageUrl } from "./posts.ts";
import { normalizeTag, type TagInput } from "./tags.ts";

/** 1 ページの既定と上限 */
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;

export type PostCard = {
  id: string;
  title: string | null;
  thumb: string;
  width: number;
  height: number;
  blurhash: string | null;
  author: { handle: string; name: string; image: string | null };
  tags: TagInput[];
  publishedAt: Date;
};

export type PostPage = { items: PostCard[]; nextCursor: string | null };

/**
 * 一覧に出してよい投稿。canView (posts.ts) でほかの人に見えて、しかも公開のもの (要件定義書 9.1)。
 * 限定公開は URL を知る人だけ、非公開は本人だけなので、一覧には出さない
 */
const listable = and(
  eq(schema.posts.status, "published"),
  eq(schema.posts.visibility, "public"),
  eq(schema.users.status, "active"),
);

export type ListInput = {
  cursor?: string | undefined;
  limit?: number | undefined;
  /** タグで絞る (S6c)。書き方のゆれはそろえてから探す */
  tag?: string | undefined;
  /** 投稿者の handle で絞る (S6c、利用者のページ) */
  author?: string | undefined;
};

/** 公開の投稿を新しい順に。タグか投稿者で絞れる。次のページがあるときだけ nextCursor を返す */
export async function listPublicPosts(
  { db, imageBaseUrl }: { db: Database; imageBaseUrl: string },
  input: ListInput,
): Promise<PostPage> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const after = input.cursor ? decodeCursor(input.cursor) : null;
  const conditions: (SQL | undefined)[] = [listable];
  if (input.tag !== undefined) {
    const { name } = normalizeTag(input.tag);
    conditions.push(
      inArray(
        schema.posts.id,
        db
          .select({ postId: schema.postTags.postId })
          .from(schema.postTags)
          .innerJoin(schema.tags, eq(schema.tags.id, schema.postTags.tagId))
          .where(eq(schema.tags.name, name)),
      ),
    );
  }
  if (input.author !== undefined) conditions.push(eq(schema.users.handle, input.author));
  if (after) {
    conditions.push(
      or(
        lt(schema.posts.publishedAt, after.at),
        and(eq(schema.posts.publishedAt, after.at), lt(schema.posts.id, after.id)),
      ),
    );
  }
  const rows = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      imageKeyBase: schema.posts.imageKeyBase,
      width: schema.posts.width,
      height: schema.posts.height,
      blurhash: schema.posts.blurhash,
      publishedAt: schema.posts.publishedAt,
      handle: schema.users.handle,
      name: schema.users.name,
      image: schema.users.image,
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(and(...conditions))
    // 索引 (posts_public_list_idx) と同じ並び。NULLS LAST まで揃えないと索引で並べられない
    .orderBy(
      sql`${schema.posts.publishedAt} desc nulls last`,
      sql`${schema.posts.id} desc nulls last`,
    )
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const tags = await tagsOfPosts(
    db,
    page.map((r) => r.id),
  );
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      title: r.title,
      thumb: imageUrl(r, imageBaseUrl, "thumb"),
      width: r.width!,
      height: r.height!,
      blurhash: r.blurhash,
      author: { handle: r.handle, name: r.name, image: r.image },
      tags: tags.get(r.id) ?? [],
      publishedAt: r.publishedAt!,
    })),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ at: last.publishedAt!.toISOString(), id: last.id })
        : null,
  };
}

/** 一覧の投稿のタグを 1 回で読み、付けた順に並べる */
async function tagsOfPosts(db: Database, postIds: string[]): Promise<Map<string, TagInput[]>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      postId: schema.postTags.postId,
      name: schema.tags.name,
      displayName: schema.tags.displayName,
    })
    .from(schema.postTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.postTags.tagId))
    .where(inArray(schema.postTags.postId, postIds))
    .orderBy(schema.postTags.postId, schema.postTags.position);
  const byPost = Map.groupBy(rows, (r) => r.postId);
  return new Map(
    [...byPost].map(([postId, tags]) => [
      postId,
      tags.map(({ name, displayName }) => ({ name, displayName })),
    ]),
  );
}

export type PublicProfile = { handle: string; name: string; image: string | null };

/** 利用者のページの見出し (S6c)。退会中の人と、無い handle は無いことにする */
export async function getPublicProfile(db: Database, handle: string): Promise<PublicProfile> {
  const [row] = await db
    .select({ handle: schema.users.handle, name: schema.users.name, image: schema.users.image })
    .from(schema.users)
    .where(and(eq(schema.users.handle, handle), eq(schema.users.status, "active")));
  if (!row) throw new DomainError("not_found", "user not found");
  return row;
}
