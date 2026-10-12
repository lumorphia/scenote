import { and, eq, sql } from "drizzle-orm";
import type { ObjectStorage } from "@lumorphia/storage";
import { editRecipeInputSchema } from "@lumorphia/editor-recipe";
import { schema, type Database } from "@lumorphia-scenote/db";
import type { JobQueue } from "../jobs/queue.ts";
import {
  isPrivateKey,
  newImageKeyBase,
  tmpKey,
  variantKey,
  type Variant,
} from "../storage-keys.ts";
import { DomainError } from "./errors.ts";
import { replacePostTags, tagsOf, validateTags, type TagInput } from "./tags.ts";

export type PostStatus = "processing" | "published" | "failed";
export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** タイトルと本文の長さの上限 (タイトルは lumorphia/prismtone と同じ) */
export const MAX_TITLE_LENGTH = 100;
export const MAX_BODY_LENGTH = 2000;

export type CreatePostInput = {
  uploadId: string;
  title?: string | null | undefined;
  body?: string | null | undefined;
  /** YYYY-MM-DD */
  takenOn?: string | null | undefined;
  /** 現像のレシピ。読めないものは断る */
  recipe?: unknown;
  /** 既定は公開 (ADR-0004) */
  visibility?: Visibility | undefined;
  /** タグ。表記のゆれはそろえる (tags.ts) */
  tags?: readonly string[] | undefined;
};

function visibility(value: Visibility | undefined): Visibility {
  if (value === undefined) return "public";
  if (!VISIBILITIES.includes(value)) throw new DomainError("validation", "unknown visibility");
  return value;
}

/** 前後の空白を落とし、空なら無いことにする */
function text(value: string | null | undefined, max: number, name: string): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if ([...trimmed].length > max) throw new DomainError("validation", `${name} is too long`);
  return trimmed;
}

/** 暦にある日で、未来でないこと。時差を見込んで明日までは受ける */
function takenOn(value: string | null | undefined, now: Date): string | null {
  if (!value) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value)
    throw new DomainError("validation", "takenOn must be a date");
  if (day.getTime() > now.getTime() + 86_400_000)
    throw new DomainError("validation", "takenOn must not be in the future");
  return value;
}

function recipe(value: unknown): unknown {
  if (value == null) return null;
  const parsed = editRecipeInputSchema.safeParse(value);
  if (!parsed.success) throw new DomainError("validation", "invalid recipe");
  return parsed.data;
}
export type PostDeps = { db: Database; storage: ObjectStorage; jobs: JobQueue };

/**
 * 受け取った画像から投稿を作り、派生画像のジョブを投入する。枠の消費・投稿・ジョブは同じトランザクション。
 * 公開されるのは派生画像ができてから (lumorphia/prismtone の createPost と publishIfReady)
 */
export async function createPost(
  { db, storage, jobs }: PostDeps,
  userId: string,
  input: CreatePostInput,
  now: Date = new Date(),
): Promise<{ postId: string }> {
  const fields = {
    title: text(input.title, MAX_TITLE_LENGTH, "title"),
    body: text(input.body, MAX_BODY_LENGTH, "body"),
    takenOn: takenOn(input.takenOn, now),
    recipe: recipe(input.recipe),
    visibility: visibility(input.visibility),
  };
  const tags = validateTags(input.tags ?? []);
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
      imageKeyBase: newImageKeyBase(postId, fields.visibility),
      uploadId: upload.id,
      ...fields,
    });
    await replacePostTags(tx, postId, tags);
    await jobs.enqueue("image-process", { postId }, { transaction: tx, singletonKey: postId });
    return { postId };
  });
}

type PostRow = typeof schema.posts.$inferSelect;

/**
 * 見られるかの判定。投稿の API、画像の中継、これからの一覧と OGP が、すべてここを通す (ADR-0004)。
 * 本人はいつでも見られる。ほかの人は、画像ができていて、投稿者が退会中でなく、非公開でないときだけ
 */
export function canView(
  post: Pick<PostRow, "userId" | "status" | "visibility">,
  authorStatus: "active" | "deleted",
  viewerId: string | null,
): boolean {
  if (viewerId !== null && viewerId === post.userId) return true;
  return post.status === "published" && authorStatus === "active" && post.visibility !== "private";
}

async function loadViewable(db: Database, viewerId: string | null, postId: string) {
  const [row] = await db
    .select({ post: schema.posts, authorStatus: schema.users.status })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(eq(schema.posts.id, postId));
  if (!row || !canView(row.post, row.authorStatus, viewerId))
    throw new DomainError("not_found", "post not found");
  return row.post;
}

export type PostView = {
  id: string;
  status: PostStatus;
  visibility: Visibility;
  isOwner: boolean;
  /** 本人にだけ見せる */
  failureReason: string | null;
  title: string | null;
  body: string | null;
  takenOn: string | null;
  tags: TagInput[];
  image: {
    display: string;
    thumb: string;
    width: number;
    height: number;
    blurhash: string | null;
  } | null;
  createdAt: Date;
};

/** 画像の URL。非公開の置き場所 (移している途中も含む) にあれば、アプリの中継を指す (ADR-0012) */
function imageUrl(post: PostRow, imageBaseUrl: string, variant: Variant): string {
  return isPrivateKey(post.imageKeyBase)
    ? `/api/posts/${post.id}/image/${variant}`
    : `${imageBaseUrl}/${variantKey(post.imageKeyBase, variant)}`;
}

/** 投稿を読む。見られない投稿は無いことにする (canView) */
export async function getPost(
  { db, imageBaseUrl }: { db: Database; imageBaseUrl: string },
  viewerId: string | null,
  postId: string,
): Promise<PostView> {
  const post = await loadViewable(db, viewerId, postId);
  const isOwner = viewerId === post.userId;
  const ready = post.status === "published" && post.width != null && post.height != null;
  return {
    id: post.id,
    status: post.status,
    visibility: post.visibility,
    isOwner,
    failureReason: isOwner ? post.failureReason : null,
    title: post.title,
    body: post.body,
    takenOn: post.takenOn,
    tags: await tagsOf(db, post.id),
    image: ready
      ? {
          display: imageUrl(post, imageBaseUrl, "display"),
          thumb: imageUrl(post, imageBaseUrl, "thumb"),
          width: post.width!,
          height: post.height!,
          blurhash: post.blurhash,
        }
      : null,
    createdAt: post.createdAt,
  };
}

/**
 * 公開範囲を変える。見られるかは新しい範囲ですぐに決まり、画像は新しい推測できないキーへ image-move が移す。
 * 古い画像の URL はそこで使えなくなる (ADR-0004)
 */
export async function changeVisibility(
  { db, jobs }: { db: Database; jobs: JobQueue },
  userId: string,
  postId: string,
  next: Visibility,
): Promise<void> {
  const to = visibility(next);
  await db.transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(schema.posts)
      .where(and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId)))
      .for("update");
    if (!post) throw new DomainError("not_found", "post not found");
    if (post.visibility === to) return;
    await tx
      .update(schema.posts)
      .set({ visibility: to, pendingImageKeyBase: newImageKeyBase(postId, to) })
      .where(eq(schema.posts.id, postId));
    await jobs.enqueue("image-move", { postId }, { transaction: tx, singletonKey: postId });
  });
}

/** アプリが中継する画像 (非公開の投稿)。判定は canView。今ある置き場所から読む */
export async function readPostImage(
  { db, storage }: { db: Database; storage: ObjectStorage },
  viewerId: string | null,
  postId: string,
  variant: Variant,
): Promise<{ body: Uint8Array; contentType: string }> {
  const post = await loadViewable(db, viewerId, postId);
  const body =
    post.status === "published" ? await storage.get(variantKey(post.imageKeyBase, variant)) : null;
  if (!body) throw new DomainError("not_found", "image not found");
  return { body, contentType: "image/webp" };
}

/** タグを付け直す (本人だけ) */
export async function changeTags(
  { db }: { db: Database },
  userId: string,
  postId: string,
  input: readonly string[],
): Promise<void> {
  const tags = validateTags(input);
  await db.transaction(async (tx) => {
    const [post] = await tx
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId)))
      .for("update");
    if (!post) throw new DomainError("not_found", "post not found");
    await replacePostTags(tx, postId, tags);
  });
}
