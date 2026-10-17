import { and, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";
import type { JobQueue } from "../jobs/queue.ts";
import { DomainError } from "./errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./browse.ts";
import { imageUrl, type PostStatus, type Visibility } from "./posts.ts";

export type MyPostCard = {
  id: string;
  status: PostStatus;
  visibility: Visibility;
  title: string | null;
  /** 画像ができる前は null。非公開と保留はアプリの中継 (ADR-0012、ADR-0014) */
  thumb: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
};

/**
 * マイページ (要件定義書 15 章)。自分の投稿を、公開範囲も状態も問わず、作った順の新しい順に。
 * 続きは (作った日時, ID) のカーソル
 */
export async function listMyPosts(
  { db, imageBaseUrl }: { db: Database; imageBaseUrl: string },
  userId: string,
  input: { cursor?: string | undefined; limit?: number | undefined },
): Promise<{ items: MyPostCard[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const after = input.cursor ? decodeCursor(input.cursor) : null;
  const conditions: (SQL | undefined)[] = [eq(schema.posts.userId, userId)];
  if (after)
    conditions.push(
      or(
        lt(schema.posts.createdAt, after.at),
        and(eq(schema.posts.createdAt, after.at), lt(schema.posts.id, after.id)),
      ),
    );
  const rows = await db
    .select()
    .from(schema.posts)
    .where(and(...conditions))
    .orderBy(sql`${schema.posts.createdAt} desc`, sql`${schema.posts.id} desc`)
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((post) => {
      const ready = (post.status === "published" || post.status === "held") && post.width != null;
      return {
        id: post.id,
        status: post.status,
        visibility: post.visibility,
        title: post.title,
        thumb: ready ? imageUrl(post, imageBaseUrl, "thumb") : null,
        width: post.width,
        height: post.height,
        createdAt: post.createdAt,
      };
    }),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}

/**
 * 自分の投稿を消す (要件定義書 15 章)。行はすぐに消し、画像は同じトランザクションで image-delete に渡す。
 * 公開範囲を変えて画像を移している途中なら、行き先も消す。消したものは戻せない
 */
export async function deletePost(
  { db, jobs }: { db: Database; jobs: JobQueue },
  userId: string,
  postId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(schema.posts)
      .where(and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId)))
      .returning({ base: schema.posts.imageKeyBase, pending: schema.posts.pendingImageKeyBase });
    if (!deleted) throw new DomainError("not_found", "post not found");
    const keyBases = deleted.pending ? [deleted.base, deleted.pending] : [deleted.base];
    await jobs.enqueue("image-delete", { keyBases }, { transaction: tx });
  });
}
