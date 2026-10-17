import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { MemoryJobQueue } from "../jobs/queue.ts";
import { imageMoveJob } from "../jobs/image-move.ts";
import { newImageKeyBase, tmpKey, variantKey } from "../storage-keys.ts";
import { createUpload } from "./uploads.ts";
import { changeVisibility, createPost, getPost, readPostImage, type Visibility } from "./posts.ts";

const databaseUrl = process.env.DATABASE_URL;
const IMAGE_BASE = "https://img.example.invalid";
const silent = { info: () => {}, warn: () => {}, error: () => {} };

// 公開範囲 (ADR-0004、ADR-0012)。見られるかの判定は posts.ts の canView の 1 か所
describe.skipIf(!databaseUrl)("post visibility (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let storage: MemoryStorage;
  let jobs: MemoryJobQueue;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
    storage = new MemoryStorage();
    jobs = new MemoryJobQueue();
  });

  async function user() {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `vi_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  /** 投稿を作り、派生画像ができたところまで進める (ジョブの代わりに行と画像を置く) */
  async function published(userId: string, visibility?: Visibility) {
    const { uploadId } = await createUpload({ db, storage, maxBytes: 1000 }, userId, {
      mime: "image/webp",
      bytes: 3,
    });
    await storage.put({
      key: tmpKey(uploadId),
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
    });
    const { postId } = await createPost({ db, storage, jobs }, userId, {
      uploadId,
      ...(visibility ? { visibility } : {}),
    });
    const [post] = await db
      .update(schema.posts)
      .set({ status: "published", width: 10, height: 10, uploadId: null })
      .where(eq(schema.posts.id, postId))
      .returning();
    for (const v of ["display", "thumb"] as const)
      await storage.put({
        key: variantKey(post!.imageKeyBase, v),
        body: new Uint8Array([7]),
        contentType: "image/webp",
      });
    return post!;
  }
  const view = (viewerId: string | null, postId: string) =>
    getPost({ db, imageBaseUrl: IMAGE_BASE }, viewerId, postId);
  const reload = (postId: string) =>
    db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
  const move = (postId: string) => imageMoveJob.handler({ postId }, { db, storage, log: silent });

  describe("creating", () => {
    it("makes a post public unless told otherwise", async () => {
      const me = await user();
      const post = await published(me.id);
      expect(post.visibility).toBe("public");
      expect(post.imageKeyBase).toMatch(/^posts\//);
    });

    it("keeps the images of a private post out of the public place", async () => {
      const me = await user();
      const post = await published(me.id, "private");
      expect(post.imageKeyBase).toMatch(new RegExp(`^private/${post.id}/`));
    });

    it("refuses a visibility it does not know", async () => {
      const me = await user();
      const { uploadId } = await createUpload({ db, storage, maxBytes: 1000 }, me.id, {
        mime: "image/webp",
        bytes: 3,
      });
      await expect(
        createPost({ db, storage, jobs }, me.id, { uploadId, visibility: "friends" as Visibility }),
      ).rejects.toMatchObject({ code: "validation" });
    });
  });

  describe("who can see a post", () => {
    it("shows a public post to anyone, with its public image", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      expect(await view(null, post.id)).toMatchObject({
        visibility: "public",
        isOwner: false,
        image: { display: `${IMAGE_BASE}/${variantKey(post.imageKeyBase, "display")}` },
      });
    });

    it("shows an unlisted post to anyone who has the URL", async () => {
      const me = await user();
      const other = await user();
      const post = await published(me.id, "unlisted");
      expect((await view(other.id, post.id)).visibility).toBe("unlisted");
    });

    it("shows a private post to its owner through the app", async () => {
      const me = await user();
      const post = await published(me.id, "private");
      expect(await view(me.id, post.id)).toMatchObject({
        isOwner: true,
        image: { display: `/api/posts/${post.id}/image/display` },
      });
    });

    it("hides a private post from everyone else", async () => {
      const me = await user();
      const other = await user();
      const post = await published(me.id, "private");
      await expect(view(other.id, post.id)).rejects.toMatchObject({ code: "not_found" });
      await expect(view(null, post.id)).rejects.toMatchObject({ code: "not_found" });
    });

    it("hides a post from others until its images are ready", async () => {
      const me = await user();
      const { uploadId } = await createUpload({ db, storage, maxBytes: 1000 }, me.id, {
        mime: "image/webp",
        bytes: 3,
      });
      await storage.put({
        key: tmpKey(uploadId),
        body: new Uint8Array([1]),
        contentType: "image/webp",
      });
      const { postId } = await createPost({ db, storage, jobs }, me.id, { uploadId });
      await expect(view(null, postId)).rejects.toMatchObject({ code: "not_found" });
      expect((await view(me.id, postId)).status).toBe("processing");
    });

    it("hides the posts of someone who has left Lumorphia", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await db
        .update(schema.users)
        .set({ status: "deleted", deletedAt: new Date() })
        .where(eq(schema.users.id, me.id));
      await expect(view(null, post.id)).rejects.toMatchObject({ code: "not_found" });
    });

    it("does not tell others why an image was refused", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await db
        .update(schema.posts)
        .set({ failureReason: "test-reason" })
        .where(eq(schema.posts.id, post.id));
      expect((await view(null, post.id)).failureReason).toBeNull();
    });
  });

  describe("changing the visibility", () => {
    it("moves the images to a new key in the new place", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await changeVisibility({ db, jobs }, me.id, post.id, "private");
      const changed = await reload(post.id);
      expect(changed).toMatchObject({ visibility: "private", imageKeyBase: post.imageKeyBase });
      expect(changed?.pendingImageKeyBase).toMatch(new RegExp(`^private/${post.id}/`));
      expect(jobs.ofType("image-move").map((j) => j.data)).toEqual([{ postId: post.id }]);
    });

    it("gives a new image URL even within the public place", async () => {
      const me = await user();
      const post = await published(me.id, "unlisted");
      await changeVisibility({ db, jobs }, me.id, post.id, "public");
      const changed = await reload(post.id);
      expect(changed?.pendingImageKeyBase).toMatch(/^posts\//);
      expect(changed?.pendingImageKeyBase).not.toBe(post.imageKeyBase);
    });

    it("hides the post from others as soon as it becomes private", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await changeVisibility({ db, jobs }, me.id, post.id, "private");
      await expect(view(null, post.id)).rejects.toMatchObject({ code: "not_found" });
    });

    it("does nothing when the visibility stays the same", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await changeVisibility({ db, jobs }, me.id, post.id, "public");
      expect(jobs.ofType("image-move")).toEqual([]);
    });

    it("does not let someone else change it", async () => {
      const me = await user();
      const other = await user();
      const post = await published(me.id, "public");
      await expect(
        changeVisibility({ db, jobs }, other.id, post.id, "private"),
      ).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });

  describe("image-move", () => {
    it("puts the images in the new place and forgets the old ones", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await changeVisibility({ db, jobs }, me.id, post.id, "private");
      const target = (await reload(post.id))!.pendingImageKeyBase!;
      await move(post.id);
      expect(await reload(post.id)).toMatchObject({
        imageKeyBase: target,
        pendingImageKeyBase: null,
      });
      expect(await storage.list(`${post.imageKeyBase}/`)).toEqual([]);
      expect(await storage.get(variantKey(target, "display"))).toEqual(new Uint8Array([7]));
    });

    it("moves the sharing image too, as a JPEG", async () => {
      const me = await user();
      const post = await published(me.id, "unlisted");
      await storage.put({
        key: variantKey(post.imageKeyBase, "ogp"),
        body: new Uint8Array([8]),
        contentType: "image/jpeg",
      });
      await changeVisibility({ db, jobs }, me.id, post.id, "public");
      const target = (await reload(post.id))!.pendingImageKeyBase!;
      await move(post.id);
      expect(await storage.head(variantKey(target, "ogp"))).toMatchObject({
        contentType: "image/jpeg",
      });
      expect(await storage.get(variantKey(post.imageKeyBase, "ogp"))).toBeNull();
    });

    it("keeps private images out of shared caches", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await changeVisibility({ db, jobs }, me.id, post.id, "private");
      const target = (await reload(post.id))!.pendingImageKeyBase!;
      await move(post.id);
      expect((await storage.head(variantKey(target, "display")))?.cacheControl).toBe(
        "private, no-store",
      );
    });

    it("follows the latest change when the visibility changed again", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await changeVisibility({ db, jobs }, me.id, post.id, "private");
      await changeVisibility({ db, jobs }, me.id, post.id, "unlisted");
      const target = (await reload(post.id))!.pendingImageKeyBase!;
      expect(target).toMatch(/^posts\//);
      await move(post.id);
      expect((await reload(post.id))?.imageKeyBase).toBe(target);
    });

    it("does nothing when there is nothing to move", async () => {
      const me = await user();
      const post = await published(me.id, "public");
      await move(post.id);
      expect((await reload(post.id))?.imageKeyBase).toBe(post.imageKeyBase);
    });
  });

  describe("readPostImage", () => {
    it("gives the owner the image of a private post", async () => {
      const me = await user();
      const post = await published(me.id, "private");
      expect(await readPostImage({ db, storage }, me.id, post.id, "display")).toMatchObject({
        body: new Uint8Array([7]),
        contentType: "image/webp",
      });
    });

    it("gives nobody else the image of a private post", async () => {
      const me = await user();
      const other = await user();
      const post = await published(me.id, "private");
      await expect(
        readPostImage({ db, storage }, other.id, post.id, "display"),
      ).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("reads from the old place while the images are moving", async () => {
      const me = await user();
      const post = await published(me.id, "private");
      await changeVisibility({ db, jobs }, me.id, post.id, "public");
      expect((await readPostImage({ db, storage }, me.id, post.id, "thumb")).body).toEqual(
        new Uint8Array([7]),
      );
    });
  });
  // 自動モデレーションで保留した投稿 (ADR-0014)。画像は非公開の置き場所にあり、本人にだけ見える
  describe("held posts", () => {
    async function held(userId: string, visibility: Visibility = "public") {
      const post = await published(userId, visibility);
      const base = newImageKeyBase(post.id, "private");
      for (const v of ["display", "thumb"] as const)
        await storage.put({
          key: variantKey(base, v),
          body: new Uint8Array([9]),
          contentType: "image/webp",
        });
      const [row] = await db
        .update(schema.posts)
        .set({ status: "held", moderationState: "held", imageKeyBase: base, publishedAt: null })
        .where(eq(schema.posts.id, post.id))
        .returning();
      return row!;
    }

    it("hides a held post from everyone else", async () => {
      const me = await user();
      const other = await user();
      const post = await held(me.id);
      await expect(view(other.id, post.id)).rejects.toMatchObject({ code: "not_found" });
      await expect(view(null, post.id)).rejects.toMatchObject({ code: "not_found" });
    });

    it("shows a held post to its owner with the image through the app", async () => {
      const me = await user();
      const post = await held(me.id);
      expect(await view(me.id, post.id)).toMatchObject({
        status: "held",
        image: { display: `/api/posts/${post.id}/image/display` },
      });
    });

    it("lets the owner read a held post's image", async () => {
      const me = await user();
      const post = await held(me.id);
      const image = await readPostImage({ db, storage }, me.id, post.id, "display");
      expect([...image.body]).toEqual([9]);
    });

    it("refuses a held post's image to everyone else", async () => {
      const me = await user();
      const post = await held(me.id);
      await expect(readPostImage({ db, storage }, null, post.id, "display")).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("keeps a held post's images in the private place when the owner changes its visibility", async () => {
      const me = await user();
      const post = await held(me.id, "private");
      await changeVisibility({ db, jobs }, me.id, post.id, "public");
      expect(await reload(post.id)).toMatchObject({
        visibility: "public",
        imageKeyBase: post.imageKeyBase,
        pendingImageKeyBase: null,
      });
      expect(jobs.ofType("image-move")).toEqual([]);
    });
  });
  // 運営が非表示にした投稿 (S7a-2、ADR-0020)。本人にだけ見え、画像は非公開の置き場所
  describe("hidden posts", () => {
    async function hidden(userId: string) {
      const post = await published(userId, "public");
      const base = newImageKeyBase(post.id, "private");
      for (const v of ["display", "thumb"] as const)
        await storage.put({
          key: variantKey(base, v),
          body: new Uint8Array([5]),
          contentType: "image/webp",
        });
      const [row] = await db
        .update(schema.posts)
        .set({ status: "hidden", imageKeyBase: base })
        .where(eq(schema.posts.id, post.id))
        .returning();
      return row!;
    }

    it("hides it from everyone else", async () => {
      const me = await user();
      const post = await hidden(me.id);
      await expect(view(null, post.id)).rejects.toMatchObject({ code: "not_found" });
    });

    it("shows it to its owner with the image through the app", async () => {
      const me = await user();
      const post = await hidden(me.id);
      expect(await view(me.id, post.id)).toMatchObject({
        status: "hidden",
        image: { display: `/api/posts/${post.id}/image/display` },
      });
      const image = await readPostImage({ db, storage }, me.id, post.id, "display");
      expect([...image.body]).toEqual([5]);
    });

    it("keeps its images in the private place when the owner changes its visibility", async () => {
      const me = await user();
      const post = await hidden(me.id);
      await changeVisibility({ db, jobs }, me.id, post.id, "unlisted");
      expect(await reload(post.id)).toMatchObject({
        visibility: "unlisted",
        imageKeyBase: post.imageKeyBase,
        pendingImageKeyBase: null,
      });
    });
  });
});
