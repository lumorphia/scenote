import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { MemoryJobQueue } from "../jobs/queue.ts";
import { isPrivateKey, newImageKeyBase } from "../storage-keys.ts";
import type { Visibility } from "./posts.ts";
import {
  createReport,
  dismissReport,
  hideReportedPost,
  listHiddenPosts,
  listOpenReports,
  restorePost,
} from "./reports.ts";

const databaseUrl = process.env.DATABASE_URL;
const ADMIN = "test-admin-sub";

// 通報と運営の対応 (docs/plan.md の S7b-1、ADR-0021)
describe.skipIf(!databaseUrl)("reports (PostgreSQL)", () => {
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
        handle: `rp_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  async function post(userId: string, visibility: Visibility = "public") {
    const id = randomUUID();
    const [row] = await db
      .insert(schema.posts)
      .values({
        id,
        userId,
        status: "published",
        visibility,
        imageKeyBase: newImageKeyBase(id, visibility),
        width: 1600,
        height: 900,
        publishedAt: new Date(),
      })
      .returning();
    return row!;
  }
  const reload = (id: string) => db.query.posts.findFirst({ where: eq(schema.posts.id, id) });
  const report = (reporterId: string, postId: string, detail = "テスト_詳しく") =>
    createReport({ db }, reporterId, postId, { reason: "depicted", detail });

  describe("createReport", () => {
    it("takes a report on someone else's post", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id);
      await report(me.id, row.id);
      expect((await listOpenReports({ db }))[0]).toMatchObject({
        postId: row.id,
        reason: "depicted",
        detail: "テスト_詳しく",
      });
    });

    it("takes a report on an unlisted post whose URL the reporter has", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id, "unlisted");
      await expect(report(me.id, row.id)).resolves.toBeUndefined();
    });

    it("refuses a report on a post the reporter cannot see", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id, "private");
      await expect(report(me.id, row.id)).rejects.toMatchObject({ code: "not_found" });
    });

    it("refuses a report on one's own post", async () => {
      const me = await user();
      const row = await post(me.id);
      await expect(report(me.id, row.id)).rejects.toMatchObject({ code: "validation" });
    });

    it("takes one open report per person and post", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id);
      await report(me.id, row.id);
      await expect(report(me.id, row.id)).rejects.toMatchObject({ code: "conflict" });
    });

    it("refuses a reason it does not know, and details that are too long", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id);
      await expect(
        createReport({ db }, me.id, row.id, { reason: "test-unknown" as "terms", detail: "" }),
      ).rejects.toMatchObject({ code: "validation" });
      await expect(report(me.id, row.id, "あ".repeat(1001))).rejects.toMatchObject({
        code: "validation",
      });
    });
  });

  describe("listOpenReports", () => {
    it("lists open reports oldest first, with the post's author", async () => {
      const owner = await user();
      const a = await user();
      const b = await user();
      const row = await post(owner.id);
      await report(a.id, row.id);
      await report(b.id, row.id);
      const open = await listOpenReports({ db });
      expect(open).toHaveLength(2);
      expect(open[0]!.createdAt.getTime()).toBeLessThanOrEqual(open[1]!.createdAt.getTime());
      expect(open[0]).toMatchObject({ post: { author: { handle: owner.handle } } });
    });

    it("does not tell the operator who reported", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id);
      await report(me.id, row.id);
      expect(JSON.stringify(await listOpenReports({ db }))).not.toContain(me.handle);
    });
  });

  describe("hideReportedPost", () => {
    it("hides the post, moves its images to the private place and closes every open report on it", async () => {
      const owner = await user();
      const a = await user();
      const b = await user();
      const row = await post(owner.id);
      await report(a.id, row.id);
      await report(b.id, row.id);
      const [first] = await listOpenReports({ db });
      await hideReportedPost({ db, jobs }, ADMIN, first!.id, "テスト_写り込み");
      const after = await reload(row.id);
      expect(after?.status).toBe("hidden");
      expect(isPrivateKey(after!.pendingImageKeyBase!)).toBe(true);
      expect(await listOpenReports({ db })).toEqual([]);
      expect((await db.select().from(schema.adminAuditLogs)).map((l) => l.action)).toEqual([
        "post_hidden",
      ]);
    });
  });

  describe("dismissReport", () => {
    it("closes only that report and leaves the post as it is", async () => {
      const owner = await user();
      const a = await user();
      const b = await user();
      const row = await post(owner.id);
      await report(a.id, row.id);
      await report(b.id, row.id);
      const [first] = await listOpenReports({ db });
      await dismissReport({ db }, ADMIN, first!.id, "テスト_問題なし");
      expect(await listOpenReports({ db })).toHaveLength(1);
      expect((await reload(row.id))?.status).toBe("published");
      expect((await db.select().from(schema.adminAuditLogs))[0]).toMatchObject({
        action: "report_dismissed",
        targetType: "report",
        targetId: first!.id,
      });
    });

    it("refuses a report that is already closed", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id);
      await report(me.id, row.id);
      const [first] = await listOpenReports({ db });
      await dismissReport({ db }, ADMIN, first!.id, "テスト_理由");
      await expect(dismissReport({ db }, ADMIN, first!.id, "テスト_理由")).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("lets the person report the post again after it is closed", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id);
      await report(me.id, row.id);
      const [first] = await listOpenReports({ db });
      await dismissReport({ db }, ADMIN, first!.id, "テスト_理由");
      await expect(report(me.id, row.id)).resolves.toBeUndefined();
    });
  });

  describe("restorePost", () => {
    it("lists hidden posts, newest hidden first", async () => {
      const owner = await user();
      const me = await user();
      const row = await post(owner.id);
      await report(me.id, row.id);
      const [first] = await listOpenReports({ db });
      await hideReportedPost({ db, jobs }, ADMIN, first!.id, "テスト_理由");
      expect((await listHiddenPosts({ db })).map((p) => p.id)).toEqual([row.id]);
    });

    it("publishes a hidden post again and moves its images back", async () => {
      const owner = await user();
      const row = await post(owner.id, "unlisted");
      await db
        .update(schema.posts)
        .set({ status: "hidden", imageKeyBase: newImageKeyBase(row.id, "private") })
        .where(eq(schema.posts.id, row.id));
      await restorePost({ db, jobs }, ADMIN, row.id, "テスト_誤り");
      const after = await reload(row.id);
      expect(after?.status).toBe("published");
      expect(after?.pendingImageKeyBase).toMatch(new RegExp(`^posts/${row.id}/`));
      expect((await db.select().from(schema.adminAuditLogs))[0]).toMatchObject({
        action: "post_restored",
        targetId: row.id,
      });
    });

    it("refuses to restore a post that is not hidden", async () => {
      const owner = await user();
      const row = await post(owner.id);
      await expect(restorePost({ db, jobs }, ADMIN, row.id, "テスト_理由")).rejects.toMatchObject({
        code: "conflict",
      });
    });
  });
});
