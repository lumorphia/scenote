import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { MemoryJobQueue } from "../jobs/queue.ts";
import { tmpKey, variantKey } from "../storage-keys.ts";
import { createUpload, UPLOAD_TTL_MS } from "./uploads.ts";
import { createPost, getOwnPost } from "./posts.ts";

const databaseUrl = process.env.DATABASE_URL;
const IMAGE_BASE = "https://img.example.invalid";

// 投稿を作る (docs/plan.md の S5a。項目は S5b で足す)
describe.skipIf(!databaseUrl)("posts (PostgreSQL)", () => {
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
        handle: `po_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  /** 署名付き PUT でブラウザが置いたところまで */
  async function uploaded(userId: string, now?: Date) {
    const { uploadId } = await createUpload(
      { db, storage, maxBytes: 1000 },
      userId,
      { mime: "image/webp", bytes: 3 },
      now,
    );
    await storage.put({
      key: tmpKey(uploadId),
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
    });
    return uploadId;
  }
  const deps = () => ({ db, storage, jobs });

  describe("createPost", () => {
    it("creates a post that waits for its images", async () => {
      const me = await user();
      const { postId } = await createPost(deps(), me.id, { uploadId: await uploaded(me.id) });
      const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
      expect(post).toMatchObject({ userId: me.id, status: "processing" });
    });

    it("asks the worker to make the images", async () => {
      const me = await user();
      const uploadId = await uploaded(me.id);
      const { postId } = await createPost(deps(), me.id, { uploadId });
      expect(jobs.ofType("image-process").map((j) => j.data)).toEqual([{ postId }]);
    });

    it("puts the images under a key nobody can guess from the post ID", async () => {
      const me = await user();
      const { postId } = await createPost(deps(), me.id, { uploadId: await uploaded(me.id) });
      const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
      expect(post?.imageKeyBase).toMatch(new RegExp(`^posts/${postId}/[A-Za-z0-9_-]{22}$`));
    });

    it("uses an upload only once", async () => {
      const me = await user();
      const uploadId = await uploaded(me.id);
      await createPost(deps(), me.id, { uploadId });
      await expect(createPost(deps(), me.id, { uploadId })).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("does not let someone else use your upload", async () => {
      const me = await user();
      const other = await user();
      const uploadId = await uploaded(me.id);
      await expect(createPost(deps(), other.id, { uploadId })).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("refuses an upload that has expired", async () => {
      const me = await user();
      const uploadId = await uploaded(me.id, new Date(Date.now() - 2 * UPLOAD_TTL_MS));
      await expect(createPost(deps(), me.id, { uploadId })).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("refuses an upload the browser has not put yet", async () => {
      const me = await user();
      const { uploadId } = await createUpload({ db, storage, maxBytes: 1000 }, me.id, {
        mime: "image/webp",
        bytes: 3,
      });
      await expect(createPost(deps(), me.id, { uploadId })).rejects.toMatchObject({
        code: "validation",
      });
    });
  });

  describe("getOwnPost", () => {
    it("shows the images once they are ready", async () => {
      const me = await user();
      const { postId } = await createPost(deps(), me.id, { uploadId: await uploaded(me.id) });
      const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
      await db
        .update(schema.posts)
        .set({ status: "published", width: 1200, height: 800, blurhash: "test-blurhash" })
        .where(eq(schema.posts.id, postId));
      expect(await getOwnPost({ db, imageBaseUrl: IMAGE_BASE }, me.id, postId)).toMatchObject({
        id: postId,
        status: "published",
        image: {
          display: `${IMAGE_BASE}/${variantKey(post!.imageKeyBase, "display")}`,
          thumb: `${IMAGE_BASE}/${variantKey(post!.imageKeyBase, "thumb")}`,
          width: 1200,
          height: 800,
          blurhash: "test-blurhash",
        },
      });
    });

    it("shows no images while they are being made", async () => {
      const me = await user();
      const { postId } = await createPost(deps(), me.id, { uploadId: await uploaded(me.id) });
      expect(await getOwnPost({ db, imageBaseUrl: IMAGE_BASE }, me.id, postId)).toMatchObject({
        status: "processing",
        image: null,
      });
    });

    it("hides another person's post", async () => {
      const me = await user();
      const other = await user();
      const { postId } = await createPost(deps(), me.id, { uploadId: await uploaded(me.id) });
      await expect(
        getOwnPost({ db, imageBaseUrl: IMAGE_BASE }, other.id, postId),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });
});
