import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { MemoryJobQueue } from "../jobs/queue.ts";
import { newImageKeyBase, variantKey } from "../storage-keys.ts";
import { replacePostTags, validateTags } from "./tags.ts";
import type { PostStatus, Visibility } from "./posts.ts";
import { deletePost, listMyPosts } from "./my-posts.ts";

const databaseUrl = process.env.DATABASE_URL;
const IMAGE_BASE = "https://img.example.invalid";

// マイページと削除 (docs/plan.md の S6d、要件定義書 15 章)
describe.skipIf(!databaseUrl)("my posts (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let jobs: MemoryJobQueue;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
    jobs = new MemoryJobQueue();
  });

  async function user() {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `my_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12, minutes));
  async function post(
    userId: string,
    fields: {
      status?: PostStatus;
      visibility?: Visibility;
      createdAt?: Date;
      tags?: string[];
    } = {},
  ) {
    const id = randomUUID();
    const visibility = fields.visibility ?? "public";
    const status = fields.status ?? "published";
    const ready = status === "published" || status === "held";
    const [row] = await db
      .insert(schema.posts)
      .values({
        id,
        userId,
        status,
        visibility,
        imageKeyBase: newImageKeyBase(id, status === "held" ? "private" : visibility),
        ...(ready ? { width: 1600, height: 900 } : {}),
        publishedAt: status === "published" ? new Date() : null,
        createdAt: fields.createdAt ?? new Date(),
      })
      .returning();
    if (fields.tags) await replacePostTags(db, id, validateTags(fields.tags));
    return row!;
  }
  const list = (userId: string, input: { cursor?: string; limit?: number } = {}) =>
    listMyPosts({ db, imageBaseUrl: IMAGE_BASE }, userId, input);

  describe("listMyPosts", () => {
    it("lists all of my posts whatever their visibility or state, newest first", async () => {
      const me = await user();
      const ids = [];
      const kinds: { status?: PostStatus; visibility?: Visibility }[] = [
        { visibility: "public" },
        { visibility: "unlisted" },
        { visibility: "private" },
        { status: "processing" },
        { status: "failed" },
        { status: "held" },
      ];
      for (const [i, kind] of kinds.entries())
        ids.unshift((await post(me.id, { ...kind, createdAt: at(i) })).id);
      expect((await list(me.id)).items.map((i) => i.id)).toEqual(ids);
    });

    it("leaves out other people's posts", async () => {
      const me = await user();
      const other = await user();
      await post(other.id);
      expect((await list(me.id)).items).toEqual([]);
    });

    it("tells the visibility and the state of each post", async () => {
      const me = await user();
      await post(me.id, { status: "held", visibility: "unlisted" });
      expect((await list(me.id)).items[0]).toMatchObject({
        status: "held",
        visibility: "unlisted",
      });
    });

    it("shows a public thumbnail from the public place", async () => {
      const me = await user();
      const row = await post(me.id);
      expect((await list(me.id)).items[0]).toMatchObject({
        thumb: `${IMAGE_BASE}/${variantKey(row.imageKeyBase, "thumb")}`,
        width: 1600,
        height: 900,
      });
    });

    it("shows a private or held thumbnail through the app", async () => {
      const me = await user();
      const row = await post(me.id, { status: "held" });
      expect((await list(me.id)).items[0]!.thumb).toBe(`/api/posts/${row.id}/image/thumb`);
    });

    it("shows no thumbnail before the images are made", async () => {
      const me = await user();
      await post(me.id, { status: "processing" });
      expect((await list(me.id)).items[0]!.thumb).toBeNull();
    });

    it("reads the next page from where the last one ended", async () => {
      const me = await user();
      const ids = [];
      for (let i = 0; i < 3; i++) ids.unshift((await post(me.id, { createdAt: at(i) })).id);
      const first = await list(me.id, { limit: 2 });
      const second = await list(me.id, { limit: 2, cursor: first.nextCursor! });
      expect([...first.items, ...second.items].map((i) => i.id)).toEqual(ids);
      expect(second.nextCursor).toBeNull();
    });

    it("refuses a cursor it did not make", async () => {
      const me = await user();
      await expect(list(me.id, { cursor: "test-broken" })).rejects.toMatchObject({
        code: "validation",
      });
    });
  });

  describe("deletePost", () => {
    it("deletes my post", async () => {
      const me = await user();
      const row = await post(me.id, { tags: ["夕焼け"] });
      await deletePost({ db, jobs }, me.id, row.id);
      expect(
        await db.query.posts.findFirst({ where: eq(schema.posts.id, row.id) }),
      ).toBeUndefined();
    });

    it("asks the worker to delete its images", async () => {
      const me = await user();
      const row = await post(me.id);
      await deletePost({ db, jobs }, me.id, row.id);
      expect(jobs.ofType("image-delete").map((j) => j.data)).toEqual([
        { keyBases: [row.imageKeyBase] },
      ]);
    });

    it("also deletes the images being moved to a new place", async () => {
      const me = await user();
      const row = await post(me.id);
      const pending = newImageKeyBase(row.id, "private");
      await db
        .update(schema.posts)
        .set({ pendingImageKeyBase: pending })
        .where(eq(schema.posts.id, row.id));
      await deletePost({ db, jobs }, me.id, row.id);
      expect(jobs.ofType("image-delete").map((j) => j.data)).toEqual([
        { keyBases: [row.imageKeyBase, pending] },
      ]);
    });

    it("does not let someone else delete it", async () => {
      const me = await user();
      const other = await user();
      const row = await post(me.id);
      await expect(deletePost({ db, jobs }, other.id, row.id)).rejects.toMatchObject({
        code: "not_found",
      });
      expect(await db.query.posts.findFirst({ where: eq(schema.posts.id, row.id) })).toBeDefined();
      expect(jobs.ofType("image-delete")).toEqual([]);
    });
  });
});
