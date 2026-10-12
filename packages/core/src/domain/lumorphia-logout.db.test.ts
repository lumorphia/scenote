import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import {
  applyLumorphiaLogout,
  consumeLumorphiaLogoutState,
  createLumorphiaLogoutState,
} from "./lumorphia-logout.ts";

const databaseUrl = process.env.DATABASE_URL;
const issuer = "https://accounts.lumorphia.test/api/auth";
const clientId = "test-scenote";

// Lumorphia のログアウト (ADR-0009。lumorphia/prismtone から写した)
describe.skipIf(!databaseUrl)("lumorphia logout (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.lumorphiaLogoutReceipts);
    await db.delete(schema.users);
    await db.delete(schema.verifications);
  });

  async function user(sub: string) {
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `test-${randomUUID()}@example.invalid`,
        handle: `lo_${randomUUID().slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  async function session(userId: string, lumorphiaSid: string | null) {
    const [row] = await db
      .insert(schema.sessions)
      .values({
        userId,
        token: `test-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
        lumorphiaSid,
      })
      .returning();
    return row!;
  }
  const remaining = async (id: string) =>
    (await db.query.sessions.findFirst({ where: eq(schema.sessions.id, id) })) !== undefined;
  const event = (sub: string, sid: string, jti = randomUUID()) => ({
    issuer,
    clientId,
    sub,
    sid,
    jti,
    expiresAt: new Date(Date.now() + 120_000),
  });

  describe("applyLumorphiaLogout", () => {
    it("ends the session with the Lumorphia session id", async () => {
      const sub = randomUUID();
      const me = await user(sub);
      const target = await session(me.id, "test-sid-a");
      await applyLumorphiaLogout(db, event(sub, "test-sid-a"));
      expect(await remaining(target.id)).toBe(false);
    });

    it("keeps the same person's sessions on other devices", async () => {
      const sub = randomUUID();
      const me = await user(sub);
      await session(me.id, "test-sid-a");
      const other = await session(me.id, "test-sid-b");
      await applyLumorphiaLogout(db, event(sub, "test-sid-a"));
      expect(await remaining(other.id)).toBe(true);
    });

    it("does not end another person's session with the same session id", async () => {
      const someone = await user(randomUUID());
      const theirs = await session(someone.id, "test-sid-a");
      await user(randomUUID());
      await applyLumorphiaLogout(db, event(randomUUID(), "test-sid-a"));
      expect(await remaining(theirs.id)).toBe(true);
    });

    it("handles the same notice only once", async () => {
      const sub = randomUUID();
      const me = await user(sub);
      await session(me.id, "test-sid-a");
      const jti = randomUUID();
      expect(await applyLumorphiaLogout(db, event(sub, "test-sid-a", jti))).toEqual({
        repeated: false,
        ended: 1,
      });
      // 同じ sid で後からできたセッションを、同じ知らせの再送で消さない
      const later = await session(me.id, "test-sid-a");
      expect(await applyLumorphiaLogout(db, event(sub, "test-sid-a", jti))).toEqual({
        repeated: true,
        ended: 0,
      });
      expect(await remaining(later.id)).toBe(true);
    });

    it("forgets receipts a day after they expire", async () => {
      const sub = randomUUID();
      await user(sub);
      const old = { ...event(sub, "test-sid-a"), expiresAt: new Date(Date.now() - 2 * 86_400_000) };
      await applyLumorphiaLogout(db, old);
      await applyLumorphiaLogout(db, event(sub, "test-sid-b"));
      expect(
        await db.query.lumorphiaLogoutReceipts.findFirst({
          where: eq(schema.lumorphiaLogoutReceipts.jti, old.jti),
        }),
      ).toBeUndefined();
    });
  });

  describe("logout state", () => {
    it("accepts a state once", async () => {
      const state = await createLumorphiaLogoutState(db);
      expect(await consumeLumorphiaLogoutState(db, state)).toBe(true);
      expect(await consumeLumorphiaLogoutState(db, state)).toBe(false);
    });

    it("rejects an unknown state", async () => {
      expect(await consumeLumorphiaLogoutState(db, "test-unknown-state")).toBe(false);
    });

    it("removes expired states when it makes a new one", async () => {
      const then = new Date(Date.now() - 60 * 60_000);
      await createLumorphiaLogoutState(db, then);
      await createLumorphiaLogoutState(db);
      expect(await db.query.verifications.findMany()).toHaveLength(1);
    });

    it("rejects a state older than ten minutes", async () => {
      const now = new Date();
      const state = await createLumorphiaLogoutState(db, now);
      expect(
        await consumeLumorphiaLogoutState(db, state, new Date(now.getTime() + 11 * 60_000)),
      ).toBe(false);
    });
  });
});
