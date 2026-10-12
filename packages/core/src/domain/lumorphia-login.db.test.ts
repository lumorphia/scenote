import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { releaseHandle, syncLumorphiaProfile } from "./lumorphia-login.ts";

const databaseUrl = process.env.DATABASE_URL;

// Lumorphia の handle・表示名・アイコンの写し (ADR-0009)
describe.skipIf(!databaseUrl)("lumorphia login (PostgreSQL)", () => {
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
  });

  async function user(handle: string, overrides: { name?: string; image?: string | null } = {}) {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: overrides.name ?? "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        image: overrides.image ?? null,
        handle,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  const reload = async (id: string) =>
    (await db.query.users.findFirst({ where: eq(schema.users.id, id) }))!;

  describe("releaseHandle", () => {
    it("moves a stale copy of the handle to a placeholder", async () => {
      const stale = await user("test_hal");
      await releaseHandle(db, "test_hal");
      expect((await reload(stale.id)).handle).toMatch(/^u_[0-9a-f]{12}$/);
    });

    it("gives each moved user a different placeholder", async () => {
      const a = await user("test_a");
      const b = await user("test_b");
      await releaseHandle(db, "test_a");
      await releaseHandle(db, "test_b");
      expect((await reload(a.id)).handle).not.toBe((await reload(b.id)).handle);
    });

    it("leaves the handle alone when the holder is the user who logs in", async () => {
      const me = await user("test_me");
      await releaseHandle(db, "test_me", me.id);
      expect((await reload(me.id)).handle).toBe("test_me");
    });

    it("does nothing when nobody holds the handle", async () => {
      const other = await user("test_other");
      await releaseHandle(db, "test_free");
      expect((await reload(other.id)).handle).toBe("test_other");
    });
  });

  describe("syncLumorphiaProfile", () => {
    it("copies the name and the icon from Lumorphia", async () => {
      const me = await user("test_me");
      await syncLumorphiaProfile(db, me.id, {
        handle: "test_me",
        name: "テスト_新しい名前",
        picture: "https://img.example.invalid/a.webp",
      });
      expect(await reload(me.id)).toMatchObject({
        name: "テスト_新しい名前",
        image: "https://img.example.invalid/a.webp",
      });
    });

    it("clears the icon when Lumorphia has none", async () => {
      const me = await user("test_me", { image: "https://img.example.invalid/a.webp" });
      await syncLumorphiaProfile(db, me.id, { handle: "test_me", name: "テスト", picture: null });
      expect((await reload(me.id)).image).toBeNull();
    });

    it("copies a changed handle", async () => {
      const me = await user("test_old");
      await syncLumorphiaProfile(db, me.id, { handle: "test_new", name: "テスト", picture: null });
      expect((await reload(me.id)).handle).toBe("test_new");
    });

    it("takes the handle over from a user whose copy is stale", async () => {
      const stale = await user("test_hal");
      const me = await user("test_me");
      await syncLumorphiaProfile(db, me.id, { handle: "test_hal", name: "テスト", picture: null });
      expect((await reload(me.id)).handle).toBe("test_hal");
      expect((await reload(stale.id)).handle).toMatch(/^u_/);
    });
  });
});
