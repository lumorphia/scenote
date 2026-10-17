import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { isAdmin, purgeOldAuditLogs, recordAdminAction, AUDIT_RETENTION_DAYS } from "./admin.ts";

const databaseUrl = process.env.DATABASE_URL;

// 管理画面の入口と操作の記録 (S7a、ADR-0019)
describe.skipIf(!databaseUrl)("admin (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
    await db.delete(schema.adminAuditLogs);
  });

  async function user(status: "active" | "deleted" = "active") {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_運営",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `ad_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
        status,
        ...(status === "deleted" ? { deletedAt: new Date() } : {}),
      })
      .returning();
    return row!;
  }

  describe("isAdmin", () => {
    it("lets in someone whose Lumorphia sub is on the list", async () => {
      const me = await user();
      expect(await isAdmin(db, me.id, [me.lumorphiaSub])).toBe(true);
    });

    it("keeps out someone not on the list", async () => {
      const me = await user();
      expect(await isAdmin(db, me.id, [randomUUID()])).toBe(false);
    });

    it("keeps out everyone when the list is empty", async () => {
      const me = await user();
      expect(await isAdmin(db, me.id, [])).toBe(false);
    });

    it("keeps out someone on the list who has left Lumorphia", async () => {
      const me = await user("deleted");
      expect(await isAdmin(db, me.id, [me.lumorphiaSub])).toBe(false);
    });

    it("keeps out a visitor", async () => {
      expect(await isAdmin(db, null, [randomUUID()])).toBe(false);
    });
  });

  describe("the audit log", () => {
    it("records who did what to what, and why", async () => {
      const at = new Date(Date.UTC(2026, 9, 1));
      const target = randomUUID();
      await recordAdminAction(db, {
        adminSub: "test-admin-sub",
        action: "post_hidden",
        targetType: "post",
        targetId: target,
        reason: "テスト_理由",
        at,
      });
      expect(await db.select().from(schema.adminAuditLogs)).toEqual([
        expect.objectContaining({
          adminSub: "test-admin-sub",
          action: "post_hidden",
          targetType: "post",
          targetId: target,
          reason: "テスト_理由",
          createdAt: at,
        }),
      ]);
    });

    it("refuses an action without a reason", async () => {
      await expect(
        recordAdminAction(db, {
          adminSub: "test-admin-sub",
          action: "post_hidden",
          targetType: "post",
          targetId: randomUUID(),
          reason: "  ",
        }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("forgets records older than the retention period", async () => {
      const now = new Date(Date.UTC(2027, 9, 1));
      const day = 86_400_000;
      const record = (at: Date) =>
        recordAdminAction(db, {
          adminSub: "test-admin-sub",
          action: "post_hidden",
          targetType: "post",
          targetId: randomUUID(),
          reason: "テスト_理由",
          at,
        });
      await record(new Date(now.getTime() - (AUDIT_RETENTION_DAYS + 1) * day));
      await record(new Date(now.getTime() - (AUDIT_RETENTION_DAYS - 1) * day));
      expect(await purgeOldAuditLogs(db, now)).toBe(1);
      expect(await db.select().from(schema.adminAuditLogs)).toHaveLength(1);
    });
  });

  it("keeps the record after the person it was about is gone", async () => {
    const me = await user();
    await recordAdminAction(db, {
      adminSub: "test-admin-sub",
      action: "post_hidden",
      targetType: "user",
      targetId: me.lumorphiaSub,
      reason: "テスト_理由",
    });
    await db.delete(schema.users).where(eq(schema.users.id, me.id));
    expect(await db.select().from(schema.adminAuditLogs)).toHaveLength(1);
  });
});
