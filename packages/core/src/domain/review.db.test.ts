import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { MemoryJobQueue } from "../jobs/queue.ts";
import { isPrivateKey, newImageKeyBase } from "../storage-keys.ts";
import type { PostStatus, Visibility } from "./posts.ts";
import { listReviewQueue, readImageForReview, reviewPost } from "./review.ts";
import { MemoryStorage } from "@lumorphia/storage";
import { variantKey } from "../storage-keys.ts";

const databaseUrl = process.env.DATABASE_URL;
const ADMIN = "test-admin-sub";

// 保留・要確認の投稿の確認 (docs/plan.md の S7a-2、ADR-0020)
describe.skipIf(!databaseUrl)("reviewing posts (PostgreSQL)", () => {
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
    await db.delete(schema.adminAuditLogs);
    jobs = new MemoryJobQueue();
  });

  async function user() {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `rv_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12, minutes));
  async function post(
    userId: string,
    kind: "held" | "flagged" | "clear" | "processing",
    fields: { visibility?: Visibility; createdAt?: Date } = {},
  ) {
    const id = randomUUID();
    const visibility = fields.visibility ?? "public";
    const status: PostStatus =
      kind === "held" ? "held" : kind === "processing" ? "processing" : "published";
    const [row] = await db
      .insert(schema.posts)
      .values({
        id,
        userId,
        status,
        visibility,
        imageKeyBase: newImageKeyBase(id, kind === "held" ? "private" : visibility),
        width: 1600,
        height: 900,
        moderationState: kind === "processing" ? null : kind,
        moderationScore: 0.5,
        moderationLabels: { nsfw: 0.5 },
        publishedAt: status === "published" ? new Date() : null,
        createdAt: fields.createdAt ?? new Date(),
      })
      .returning();
    return row!;
  }
  const reload = (id: string) => db.query.posts.findFirst({ where: eq(schema.posts.id, id) });
  const review = (postId: string, decision: "approve" | "reject", reason = "テスト_理由") =>
    reviewPost({ db, jobs }, ADMIN, postId, { decision, reason });

  describe("listReviewQueue", () => {
    it("lists held and unreviewed flagged posts, oldest first", async () => {
      const me = await user();
      const held = await post(me.id, "held", { createdAt: at(2) });
      const flagged = await post(me.id, "flagged", { createdAt: at(1) });
      await post(me.id, "clear");
      await post(me.id, "processing");
      expect((await listReviewQueue({ db })).map((i) => i.id)).toEqual([flagged.id, held.id]);
    });

    it("tells why each post is waiting, with the judgement", async () => {
      const me = await user();
      const row = await post(me.id, "held");
      expect((await listReviewQueue({ db }))[0]).toMatchObject({
        id: row.id,
        status: "held",
        moderationState: "held",
        moderationLabels: { nsfw: 0.5 },
        visibility: "public",
        author: { handle: me.handle },
      });
    });

    it("leaves out a flagged post once it is reviewed", async () => {
      const me = await user();
      const row = await post(me.id, "flagged");
      await review(row.id, "approve");
      expect(await listReviewQueue({ db })).toEqual([]);
    });
  });

  describe("approving", () => {
    it("publishes a held post and moves its images to where its visibility says", async () => {
      const me = await user();
      const row = await post(me.id, "held", { visibility: "unlisted" });
      await review(row.id, "approve");
      const after = await reload(row.id);
      expect(after).toMatchObject({ status: "published" });
      expect(after?.publishedAt).toBeInstanceOf(Date);
      expect(after?.reviewedAt).toBeInstanceOf(Date);
      expect(after?.pendingImageKeyBase).toMatch(new RegExp(`^posts/${row.id}/`));
      expect(jobs.ofType("image-move").map((j) => j.data)).toEqual([{ postId: row.id }]);
    });

    it("keeps the images of an approved private post where they are", async () => {
      const me = await user();
      const row = await post(me.id, "held", { visibility: "private" });
      await review(row.id, "approve");
      expect(await reload(row.id)).toMatchObject({
        status: "published",
        pendingImageKeyBase: null,
      });
      expect(jobs.ofType("image-move")).toEqual([]);
    });

    it("only marks a flagged post as reviewed", async () => {
      const me = await user();
      const row = await post(me.id, "flagged");
      await review(row.id, "approve");
      const after = await reload(row.id);
      expect(after).toMatchObject({ status: "published", imageKeyBase: row.imageKeyBase });
      expect(after?.reviewedAt).toBeInstanceOf(Date);
    });

    it("records who approved it and why", async () => {
      const me = await user();
      const row = await post(me.id, "held");
      await review(row.id, "approve", "テスト_問題なし");
      expect(await db.select().from(schema.adminAuditLogs)).toEqual([
        expect.objectContaining({
          adminSub: ADMIN,
          action: "post_approved",
          targetType: "post",
          targetId: row.id,
          reason: "テスト_問題なし",
        }),
      ]);
    });
  });

  describe("rejecting", () => {
    it("hides the post and moves its images out of the public place", async () => {
      const me = await user();
      const row = await post(me.id, "flagged");
      await review(row.id, "reject");
      const after = await reload(row.id);
      expect(after).toMatchObject({ status: "hidden" });
      expect(isPrivateKey(after!.pendingImageKeyBase!)).toBe(true);
      expect(jobs.ofType("image-move").map((j) => j.data)).toEqual([{ postId: row.id }]);
    });

    it("hides a held post where its images already are", async () => {
      const me = await user();
      const row = await post(me.id, "held");
      await review(row.id, "reject");
      expect(await reload(row.id)).toMatchObject({ status: "hidden", pendingImageKeyBase: null });
    });

    it("records who hid it and why", async () => {
      const me = await user();
      const row = await post(me.id, "held");
      await review(row.id, "reject");
      expect((await db.select().from(schema.adminAuditLogs))[0]).toMatchObject({
        action: "post_hidden",
        targetId: row.id,
      });
    });
  });

  it("refuses to review a post that is not waiting", async () => {
    const me = await user();
    const row = await post(me.id, "clear");
    await expect(review(row.id, "reject")).rejects.toMatchObject({ code: "conflict" });
    expect(await db.select().from(schema.adminAuditLogs)).toEqual([]);
  });

  it("refuses a review without a reason, and changes nothing", async () => {
    const me = await user();
    const row = await post(me.id, "held");
    await expect(review(row.id, "approve", " ")).rejects.toMatchObject({ code: "validation" });
    expect((await reload(row.id))?.status).toBe("held");
  });

  it("answers not found for a post that does not exist", async () => {
    await expect(review(randomUUID(), "approve")).rejects.toMatchObject({ code: "not_found" });
  });
  describe("readImageForReview", () => {
    it("lets the operator see the image of a held post in the private place", async () => {
      const storage = new MemoryStorage();
      const me = await user();
      const row = await post(me.id, "held");
      await storage.put({
        key: variantKey(row.imageKeyBase, "display"),
        body: new Uint8Array([3]),
        contentType: "image/webp",
      });
      const image = await readImageForReview({ db, storage }, row.id, "display");
      expect([...image.body]).toEqual([3]);
    });

    it("answers not found for a post with no image", async () => {
      const storage = new MemoryStorage();
      const me = await user();
      const row = await post(me.id, "processing");
      await expect(readImageForReview({ db, storage }, row.id, "display")).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });
});
