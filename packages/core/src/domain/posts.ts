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
import { assertNoBlockedText } from "./blocked-text.ts";
import { replacePostTags, tagsOf, validateTags, type TagInput } from "./tags.ts";
import { isOfferedPlace } from "./places.ts";

export type PostStatus = "processing" | "published" | "failed" | "held";
export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** タイトルと本文の長さの上限 (タイトルは lumorphia/prismtone と同じ) */
export const MAX_TITLE_LENGTH = 100;
export const MAX_BODY_LENGTH = 2000;
/** 自由入力の撮影場所の長さの上限 */
export const MAX_PLACE_TEXT_LENGTH = 50;

export type PlaceInput = {
  placeId?: string | null | undefined;
  placeText?: string | null | undefined;
};

/** 候補から選んだ場所か、自由に書いた場所か、どちらか一方 (要件定義書 10 章) */
async function place(
  db: Database,
  input: PlaceInput,
): Promise<{ placeId: string | null; placeText: string | null }> {
  const placeText = text(input.placeText, MAX_PLACE_TEXT_LENGTH, "placeText");
  const placeId = input.placeId ?? null;
  if (placeId && placeText)
    throw new DomainError("validation", "choose a place or write one, not both");
  if (placeId && !(await isOfferedPlace(db, placeId)))
    throw new DomainError("validation", "unknown place");
  return { placeId, placeText };
}

export type CreatePostInput = PlaceInput & {
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
  const where = await place(db, input);
  // NG 語 (ADR-0015)。受け取りの枠を使う前に断る
  assertNoBlockedText({
    ...fields,
    tags: tags.map((t) => t.displayName),
    placeText: where.placeText,
  });
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
      ...where,
    });
    await replacePostTags(tx, postId, tags);
    await jobs.enqueue("image-process", { postId }, { transaction: tx, singletonKey: postId });
    return { postId };
  });
}

type PostRow = typeof schema.posts.$inferSelect;

/**
 * 見られるかの判定。投稿の API、画像の中継、これからの一覧と OGP が、すべてここを通す (ADR-0004)。
 * 本人はいつでも見られる。ほかの人は、画像ができていて、投稿者が退会中でなく、非公開でないときだけ。
 * 一覧 (browse.ts の listable) は、これに「公開」を足したものと同じでなければならない (browse.db.test.ts で突き合わせる)
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
  /** 候補から選んだ場所なら id と地域つき、自由入力なら名前だけ */
  place: { id: string | null; regionName: string | null; name: string } | null;
  image: {
    display: string;
    thumb: string;
    width: number;
    height: number;
    blurhash: string | null;
  } | null;
  createdAt: Date;
};

/** 派生画像ができている (保留した投稿にも、本人に見せる画像はある。ADR-0014) */
const hasImages = (post: Pick<PostRow, "status">) =>
  post.status === "published" || post.status === "held";

/** 画像の URL。非公開の置き場所 (移している途中も含む) にあれば、アプリの中継を指す (ADR-0012) */
export function imageUrl(
  post: Pick<PostRow, "id" | "imageKeyBase">,
  imageBaseUrl: string,
  variant: Variant,
): string {
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
  const ready = hasImages(post) && post.width != null && post.height != null;
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
    place: await placeOf(db, post),
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
    // 保留した投稿の画像は、範囲によらず非公開の置き場所に置いたまま (ADR-0014)
    if (post.status === "held") {
      await tx.update(schema.posts).set({ visibility: to }).where(eq(schema.posts.id, postId));
      return;
    }
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
  const body = hasImages(post) ? await storage.get(variantKey(post.imageKeyBase, variant)) : null;
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
  assertNoBlockedText({ tags: tags.map((t) => t.displayName) });
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

async function placeOf(db: Database, post: PostRow): Promise<PostView["place"]> {
  if (post.placeId) {
    const [row] = await db.select().from(schema.places).where(eq(schema.places.id, post.placeId));
    if (row) return { id: row.id, regionName: row.regionName, name: row.name };
  }
  return post.placeText ? { id: null, regionName: null, name: post.placeText } : null;
}

/** 撮影場所を付け直す (本人だけ)。どちらも無ければ外す */
export async function changePlace(
  { db }: { db: Database },
  userId: string,
  postId: string,
  input: PlaceInput,
): Promise<void> {
  const where = await place(db, input);
  assertNoBlockedText({ placeText: where.placeText });
  const [changed] = await db
    .update(schema.posts)
    .set(where)
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId)))
    .returning({ id: schema.posts.id });
  if (!changed) throw new DomainError("not_found", "post not found");
}
