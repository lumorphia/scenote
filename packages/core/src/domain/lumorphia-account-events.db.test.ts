import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { MemoryJobQueue } from "../jobs/queue.ts";
import {
  applyLumorphiaAccountEvent,
  prepareLoginAfterDeletion,
  restoreOnLogin,
  type LumorphiaAccountEvent,
} from "./lumorphia-account-events.ts";

const databaseUrl = process.env.DATABASE_URL;
const DAY = 86_400_000;

// 退会・復旧・物理削除の知らせ (ADR-0010)
describe.skipIf(!databaseUrl)("lumorphia account events (PostgreSQL)", () => {
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
    await db.delete(schema.lumorphiaAccountEvents);
    await db.delete(schema.users);
    jobs = new MemoryJobQueue();
  });

  async function user(overrides: { status?: "active" | "deleted"; deletedAt?: Date } = {}) {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `ae_${randomUUID().slice(0, 8)}`,
        lumorphiaSub: sub,
        ...overrides,
      })
      .returning();
    return row!;
  }
  async function session(userId: string) {
    await db.insert(schema.sessions).values({
      userId,
      token: `test-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
  }
  async function post(userId: string) {
    const [row] = await db
      .insert(schema.posts)
      .values({ userId, imageKeyBase: `posts/${randomUUID()}/test-key`, status: "published" })
      .returning();
    return row!;
  }
  const reload = (id: string) => db.query.users.findFirst({ where: eq(schema.users.id, id) });
  const sessionsOf = (userId: string) =>
    db.query.sessions.findMany({ where: eq(schema.sessions.userId, userId) });
  const event = (
    sub: string,
    state: LumorphiaAccountEvent["state"],
    revision: number,
    eventId = randomUUID(),
  ): LumorphiaAccountEvent => ({
    eventId,
    sub,
    revision,
    state,
    deletedAt: state === "deleted" ? new Date("2026-10-01T00:00:00.000Z") : null,
  });

  describe("applyLumorphiaAccountEvent", () => {
    it("marks the user deleted at the time accounts deleted them", async () => {
      const me = await user();
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "deleted", 1));
      expect(await reload(me.id)).toMatchObject({
        status: "deleted",
        deletedAt: new Date("2026-10-01T00:00:00.000Z"),
      });
    });

    it("ends the sessions of a deleted user", async () => {
      const me = await user();
      await session(me.id);
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "deleted", 1));
      expect(await sessionsOf(me.id)).toEqual([]);
    });

    it("brings a deleted user back", async () => {
      const me = await user({ status: "deleted", deletedAt: new Date() });
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "active", 2));
      expect(await reload(me.id)).toMatchObject({ status: "active", deletedAt: null });
    });

    it("removes a purged user", async () => {
      const me = await user({ status: "deleted", deletedAt: new Date() });
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "purged", 2));
      expect(await reload(me.id)).toBeUndefined();
    });

    it("applies the same notice only once", async () => {
      const me = await user();
      const deleted = event(me.lumorphiaSub, "deleted", 1);
      await applyLumorphiaAccountEvent({ db, jobs }, deleted);
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "active", 2));
      await applyLumorphiaAccountEvent({ db, jobs }, deleted);
      expect((await reload(me.id))?.status).toBe("active");
    });

    it("ignores a notice older than one already applied", async () => {
      const me = await user();
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "active", 3));
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "deleted", 2));
      expect((await reload(me.id))?.status).toBe("active");
    });

    it("does not remember notices for people who never came to Scenote", async () => {
      await applyLumorphiaAccountEvent({ db, jobs }, event(randomUUID(), "deleted", 1));
      expect(await db.query.lumorphiaAccountEvents.findMany()).toEqual([]);
    });

    it("removes the images of a purged user's posts", async () => {
      const me = await user();
      const mine = await post(me.id);
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "purged", 2));
      expect(jobs.ofType("image-delete").map((j) => j.data)).toEqual([
        { keyBases: [mine.imageKeyBase] },
      ]);
    });

    it("keeps the images of a user who is only deleted", async () => {
      const me = await user();
      await post(me.id);
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "deleted", 1));
      expect(jobs.ofType("image-delete")).toEqual([]);
    });

    it("forgets the notices of a purged user", async () => {
      const me = await user();
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "deleted", 1));
      await applyLumorphiaAccountEvent({ db, jobs }, event(me.lumorphiaSub, "purged", 2));
      expect(await db.query.lumorphiaAccountEvents.findMany()).toEqual([]);
    });
  });

  describe("logging in after a deletion", () => {
    it("removes a user whose recovery period has passed so they start anew", async () => {
      const me = await user({ status: "deleted", deletedAt: new Date(Date.now() - 31 * DAY) });
      await prepareLoginAfterDeletion({ db, jobs }, me.lumorphiaSub);
      expect(await reload(me.id)).toBeUndefined();
    });

    it("removes the images of a user whose recovery period has passed", async () => {
      const me = await user({ status: "deleted", deletedAt: new Date(Date.now() - 31 * DAY) });
      const mine = await post(me.id);
      await prepareLoginAfterDeletion({ db, jobs }, me.lumorphiaSub);
      expect(jobs.ofType("image-delete").map((j) => j.data)).toEqual([
        { keyBases: [mine.imageKeyBase] },
      ]);
    });

    it("keeps a user still within the recovery period", async () => {
      const me = await user({ status: "deleted", deletedAt: new Date(Date.now() - 29 * DAY) });
      await prepareLoginAfterDeletion({ db, jobs }, me.lumorphiaSub);
      expect(await reload(me.id)).toBeDefined();
    });

    it("brings back a deleted user who could log in at Lumorphia", async () => {
      // ログインが完了したなら accounts では active。知らせより先に来たときはここで戻す
      const me = await user({ status: "deleted", deletedAt: new Date() });
      await restoreOnLogin(db, me.id);
      expect(await reload(me.id)).toMatchObject({ status: "active", deletedAt: null });
    });
  });
});
