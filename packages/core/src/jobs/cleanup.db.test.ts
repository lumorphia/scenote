import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { createUpload, UPLOAD_TTL_MS } from "../domain/uploads.ts";
import { tmpKey, variantKey } from "../storage-keys.ts";
import { auditLogPurgeJob, imageDeleteJob, uploadCleanupJob } from "./cleanup.ts";
import { AUDIT_RETENTION_DAYS } from "../domain/admin.ts";
import type { JobContext } from "./context.ts";

const databaseUrl = process.env.DATABASE_URL;
const silent = { info: () => {}, warn: () => {}, error: () => {} };

// 受け取りの枠と画像の後片付け (docs/plan.md の S5a)
describe.skipIf(!databaseUrl)("cleanup jobs (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let storage: MemoryStorage;
  let ctx: JobContext;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
    storage = new MemoryStorage();
    ctx = { db, storage, log: silent };
  });

  async function upload(createdAt: Date) {
    const sub = randomUUID();
    const [me] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `cl_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    const { uploadId } = await createUpload(
      { db, storage, maxBytes: 1000 },
      me!.id,
      { mime: "image/webp", bytes: 3 },
      createdAt,
    );
    await storage.put({
      key: tmpKey(uploadId),
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
    });
    return uploadId;
  }
  const row = (id: string) => db.query.uploads.findFirst({ where: eq(schema.uploads.id, id) });

  describe("upload-cleanup", () => {
    it("forgets an upload nobody posted before it expired", async () => {
      const id = await upload(new Date(Date.now() - 2 * UPLOAD_TTL_MS));
      await uploadCleanupJob.handler({}, ctx);
      expect(await row(id)).toBeUndefined();
    });

    it("removes the image of an expired upload", async () => {
      const id = await upload(new Date(Date.now() - 2 * UPLOAD_TTL_MS));
      await uploadCleanupJob.handler({}, ctx);
      expect(await storage.get(tmpKey(id))).toBeNull();
    });

    it("keeps an upload that has not expired", async () => {
      const id = await upload(new Date());
      await uploadCleanupJob.handler({}, ctx);
      expect(await row(id)).toBeDefined();
      expect(await storage.get(tmpKey(id))).not.toBeNull();
    });

    it("keeps the image of a post still waiting for its variants", async () => {
      const id = await upload(new Date(Date.now() - 2 * UPLOAD_TTL_MS));
      const [owner] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, id));
      await db.insert(schema.posts).values({
        userId: owner!.userId,
        imageKeyBase: `posts/${randomUUID()}/test-key`,
        uploadId: id,
      });
      await uploadCleanupJob.handler({}, ctx);
      expect(await storage.get(tmpKey(id))).not.toBeNull();
    });

    it("removes images left in the temporary place without an upload", async () => {
      await storage.put({
        key: tmpKey(randomUUID()),
        body: new Uint8Array([1]),
        contentType: "image/webp",
      });
      await uploadCleanupJob.handler({}, ctx);
      expect(await storage.list("tmp/")).toEqual([]);
    });
  });

  // 管理画面の操作の記録 (S7a、ADR-0019)。保存期間を過ぎたものを毎日消す
  describe("audit-log-purge", () => {
    it("forgets records older than the retention period", async () => {
      await db.delete(schema.adminAuditLogs);
      const old = new Date(Date.now() - (AUDIT_RETENTION_DAYS + 1) * 86_400_000);
      await db.insert(schema.adminAuditLogs).values([
        {
          adminSub: "test-admin-sub",
          action: "post_hidden",
          targetType: "post",
          targetId: "test-old",
          reason: "テスト_理由",
          createdAt: old,
        },
        {
          adminSub: "test-admin-sub",
          action: "post_hidden",
          targetType: "post",
          targetId: "test-new",
          reason: "テスト_理由",
        },
      ]);
      await auditLogPurgeJob.handler({}, ctx);
      expect((await db.select().from(schema.adminAuditLogs)).map((r) => r.targetId)).toEqual([
        "test-new",
      ]);
    });

    it("runs every day", () => {
      expect(auditLogPurgeJob.cron).toMatch(/^\d+ \d+ \* \* \*$/);
    });
  });

  describe("image-delete", () => {
    it("removes every variant of the given posts", async () => {
      const base = `posts/${randomUUID()}/test-key`;
      for (const v of ["display", "thumb"] as const)
        await storage.put({
          key: variantKey(base, v),
          body: new Uint8Array([1]),
          contentType: "image/webp",
        });
      await imageDeleteJob.handler({ keyBases: [base] }, ctx);
      expect(await storage.list(`${base}/`)).toEqual([]);
    });

    it("leaves other posts' images alone", async () => {
      const keep = `posts/${randomUUID()}/test-keep`;
      await storage.put({
        key: variantKey(keep, "display"),
        body: new Uint8Array([1]),
        contentType: "image/webp",
      });
      await imageDeleteJob.handler({ keyBases: [`posts/${randomUUID()}/test-gone`] }, ctx);
      expect(await storage.list(`${keep}/`)).toHaveLength(1);
    });
  });
});
