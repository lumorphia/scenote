import { and, asc, eq, isNull, or } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";
import type { JobQueue } from "../jobs/queue.ts";
import type { ObjectStorage } from "@lumorphia/storage";
import { isPrivateKey, newImageKeyBase, variantKey, type Variant } from "../storage-keys.ts";
import { recordAdminAction } from "./admin.ts";
import { DomainError } from "./errors.ts";
import type { PostStatus, Visibility } from "./posts.ts";

/** 確かめるのを待っている投稿。保留と、要確認 (flagged) でまだ確かめていないもの (ADR-0020) */
const waiting = or(
  eq(schema.posts.status, "held"),
  and(
    eq(schema.posts.status, "published"),
    eq(schema.posts.moderationState, "flagged"),
    isNull(schema.posts.reviewedAt),
  ),
);

export type ReviewItem = {
  id: string;
  status: PostStatus;
  visibility: Visibility;
  moderationState: "clear" | "flagged" | "held" | null;
  moderationScore: number | null;
  moderationLabels: Record<string, number> | null;
  title: string | null;
  body: string | null;
  author: { handle: string; name: string };
  createdAt: Date;
};

/** 管理画面の確認待ち。古い順 (待たせた順) に */
export async function listReviewQueue({ db }: { db: Database }): Promise<ReviewItem[]> {
  const rows = await db
    .select({
      post: schema.posts,
      handle: schema.users.handle,
      name: schema.users.name,
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(waiting)
    .orderBy(asc(schema.posts.createdAt), asc(schema.posts.id));
  return rows.map(({ post, handle, name }) => ({
    id: post.id,
    status: post.status,
    visibility: post.visibility,
    moderationState: post.moderationState,
    moderationScore: post.moderationScore,
    moderationLabels: post.moderationLabels,
    title: post.title,
    body: post.body,
    author: { handle, name },
    createdAt: post.createdAt,
  }));
}

export type ReviewInput = { decision: "approve" | "reject"; reason: string };

/**
 * 確かめた結果を当てる (ADR-0020)。行を FOR UPDATE し、状態の変更・画像の移動の投入・操作の記録を同じトランザクションで。
 * approve: 保留なら公開し、画像を公開範囲どおりの置き場所へ。要確認なら確かめた印だけ。
 * reject: 非表示 (hidden) にし、画像を非公開の置き場所へ。
 * 待っていない投稿は conflict
 */
export async function reviewPost(
  { db, jobs }: { db: Database; jobs: JobQueue },
  adminSub: string,
  postId: string,
  input: ReviewInput,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(schema.posts)
      .where(eq(schema.posts.id, postId))
      .for("update");
    if (!post) throw new DomainError("not_found", "post not found");
    const isWaiting =
      post.status === "held" ||
      (post.status === "published" && post.moderationState === "flagged" && !post.reviewedAt);
    if (!isWaiting) throw new DomainError("conflict", "post is not waiting for review");

    await recordAdminAction(tx, {
      adminSub,
      action: input.decision === "approve" ? "post_approved" : "post_hidden",
      targetType: "post",
      targetId: postId,
      reason: input.reason,
      at: now,
    });

    const to: Visibility | null =
      input.decision === "reject" ? "private" : post.status === "held" ? post.visibility : null;
    // 画像の置き場所を変えるときだけ移す (非公開の投稿を公開するときや、もう非公開の置き場所にあるときは動かさない)
    const move = to !== null && isPrivateKey(post.imageKeyBase) !== (to === "private");
    await tx
      .update(schema.posts)
      .set({
        reviewedAt: now,
        ...(input.decision === "reject" ? { status: "hidden" as const } : {}),
        ...(input.decision === "approve" && post.status === "held"
          ? { status: "published" as const, publishedAt: now }
          : {}),
        ...(move ? { pendingImageKeyBase: newImageKeyBase(postId, to) } : {}),
      })
      .where(eq(schema.posts.id, postId));
    if (move)
      await jobs.enqueue("image-move", { postId }, { transaction: tx, singletonKey: postId });
  });
}

/**
 * 運営が確かめるための画像 (ADR-0020)。保留した投稿の画像は非公開の置き場所にあり、canView では本人にしか見えない。
 * 管理画面だけがこれを使う (requireAdmin)。今ある置き場所から読む
 */
export async function readImageForReview(
  { db, storage }: { db: Database; storage: ObjectStorage },
  postId: string,
  variant: Exclude<Variant, "ogp">,
): Promise<{ body: Uint8Array; contentType: string }> {
  const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
  const body =
    post?.width != null ? await storage.get(variantKey(post.imageKeyBase, variant)) : null;
  if (!body) throw new DomainError("not_found", "image not found");
  return { body, contentType: "image/webp" };
}
