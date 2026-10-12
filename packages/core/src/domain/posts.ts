import { and, eq, sql } from "drizzle-orm";
import type { ObjectStorage } from "@lumorphia/storage";
import { schema, type Database } from "@lumorphia-scenote/db";
import type { JobQueue } from "../jobs/queue.ts";
import { newImageKeyBase, tmpKey, variantKey } from "../storage-keys.ts";
import { DomainError } from "./errors.ts";

export type PostStatus = "processing" | "published" | "failed";
export type PostDeps = { db: Database; storage: ObjectStorage; jobs: JobQueue };

/**
 * 受け取った画像から投稿を作り、派生画像のジョブを投入する。枠の消費・投稿・ジョブは同じトランザクション。
 * 公開されるのは派生画像ができてから (lumorphia/prismtone の createPost と publishIfReady)
 */
export async function createPost(
  { db, storage, jobs }: PostDeps,
  userId: string,
  input: { uploadId: string },
  now: Date = new Date(),
): Promise<{ postId: string }> {
  return db.transaction(async (tx) => {
    const [upload] = await tx
      .select()
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, input.uploadId), eq(schema.uploads.userId, userId)))
      .for("update");
    if (!upload || upload.expiresAt <= now) throw new DomainError("not_found", "upload not found");
    if (upload.status !== "pending") throw new DomainError("conflict", "upload already used");
    if (!(await storage.head(tmpKey(upload.id))))
      throw new DomainError("validation", "the image has not been uploaded");

    await tx
      .update(schema.uploads)
      .set({ status: "consumed" })
      .where(eq(schema.uploads.id, upload.id));
    const generated = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
    const postId = generated.rows[0]!.id;
    await tx.insert(schema.posts).values({
      id: postId,
      userId,
      imageKeyBase: newImageKeyBase(postId),
      uploadId: upload.id,
    });
    await jobs.enqueue("image-process", { postId }, { transaction: tx, singletonKey: postId });
    return { postId };
  });
}

export type OwnPostView = {
  id: string;
  status: PostStatus;
  failureReason: string | null;
  image: {
    display: string;
    thumb: string;
    width: number;
    height: number;
    blurhash: string | null;
  } | null;
  createdAt: Date;
};

/** 自分の投稿を読む。ほかの人のものは無いことにする (公開範囲の認可は S5c で 1 か所にまとめる) */
export async function getOwnPost(
  { db, imageBaseUrl }: { db: Database; imageBaseUrl: string },
  userId: string,
  postId: string,
): Promise<OwnPostView> {
  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId)),
  });
  if (!post) throw new DomainError("not_found", "post not found");
  const ready = post.status === "published" && post.width != null && post.height != null;
  return {
    id: post.id,
    status: post.status,
    failureReason: post.failureReason,
    image: ready
      ? {
          display: `${imageBaseUrl}/${variantKey(post.imageKeyBase, "display")}`,
          thumb: `${imageBaseUrl}/${variantKey(post.imageKeyBase, "thumb")}`,
          width: post.width!,
          height: post.height!,
          blurhash: post.blurhash,
        }
      : null,
    createdAt: post.createdAt,
  };
}
