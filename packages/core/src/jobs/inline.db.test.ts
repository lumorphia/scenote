import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { InlineJobQueue } from "./inline.ts";
import type { JobDefinition } from "./context.ts";

const url = process.env.DATABASE_URL;
const silent = { info: () => {}, warn: () => {}, error: () => {} };

// 開発と E2E でアプリの中でジョブを走らせる (JOBS_INLINE)
describe.skipIf(!url)("inline job queue (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = createDatabase(url!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
  });

  /** ジョブが走ったときに、その利用者の行が見えたかを記録する */
  function probe() {
    const seen: (string | null)[] = [];
    const job: JobDefinition<{ userId: string }> = {
      name: "image-process",
      async handler({ userId }, ctx) {
        const row = await ctx.db.query.users.findFirst({ where: eq(schema.users.id, userId) });
        seen.push(row?.id ?? null);
      },
    };
    const queue = new InlineJobQueue({ db, storage: new MemoryStorage(), log: silent }, [
      job as JobDefinition<never>,
    ]);
    return { seen, queue };
  }
  const insertUser = (tx: Database) => {
    const sub = randomUUID();
    return tx
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `in_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning()
      .then((rows) => rows[0]!);
  };

  it("runs a job queued in a transaction after it commits", async () => {
    const { seen, queue } = probe();
    const user = await db.transaction(async (tx) => {
      const row = await insertUser(tx);
      await queue.enqueue("image-process", { userId: row.id }, { transaction: tx });
      // 確定が遅れても、ジョブは確定を待つ
      await new Promise((r) => setTimeout(r, 100));
      return row;
    });
    await queue.drain();
    expect(seen).toEqual([user.id]);
  });

  it("does not run a job queued in a transaction that fails", async () => {
    const { seen, queue } = probe();
    await expect(
      db.transaction(async (tx) => {
        const row = await insertUser(tx);
        await queue.enqueue("image-process", { userId: row.id }, { transaction: tx });
        throw new Error("test-rollback");
      }),
    ).rejects.toThrow("test-rollback");
    await queue.drain();
    expect(seen).toEqual([]);
  });

  it("runs a job queued outside a transaction", async () => {
    const { seen, queue } = probe();
    const user = await insertUser(db);
    await queue.enqueue("image-process", { userId: user.id });
    await queue.drain();
    expect(seen).toEqual([user.id]);
  });
});
