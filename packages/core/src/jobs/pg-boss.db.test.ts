import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, type Database } from "@lumorphia-scenote/db";
import { PgBossJobQueue, prepareQueues, startWorker } from "./pg-boss.ts";
import type { JobDefinition } from "./context.ts";

const url = process.env.DATABASE_URL;
const silent = { info: () => {}, warn: () => {}, error: () => {} };

// pg-boss のキューと worker (lumorphia/accounts と同じ形)
describe.skipIf(!url)("pg-boss queue", () => {
  let db: Database;
  let close: () => Promise<void>;
  let boss: PgBoss;
  let queue: PgBossJobQueue;
  beforeAll(async () => {
    ({ db, close } = createDatabase(url!));
    boss = new PgBoss({
      connectionString: url!,
      schema: "pgboss",
      supervise: false,
      schedule: false,
    });
    boss.on("error", () => {});
    await boss.start();
    await prepareQueues(boss);
    queue = new PgBossJobQueue(boss);
  }, 30_000);
  beforeEach(async () => {
    await boss.deleteAllJobs();
  });
  afterAll(async () => {
    await boss?.stop({ graceful: true, timeout: 1000 });
    await close?.();
  });

  it("keeps a job queued in a transaction that commits", async () => {
    const postId = randomUUID();
    await db.transaction(async (tx) => {
      await queue.enqueue("image-process", { postId }, { transaction: tx });
    });
    expect((await boss.fetch<{ postId: string }>("image-process")).map((j) => j.data)).toEqual([
      { postId },
    ]);
  });

  it("drops a job queued in a transaction that fails", async () => {
    await expect(
      db.transaction(async (tx) => {
        await queue.enqueue("image-process", { postId: randomUUID() }, { transaction: tx });
        throw new Error("test-rollback");
      }),
    ).rejects.toThrow("test-rollback");
    expect(await boss.fetch("image-process")).toEqual([]);
  });

  it("queues the same post only once while it waits", async () => {
    const postId = randomUUID();
    await queue.enqueue("image-process", { postId }, { singletonKey: postId });
    await queue.enqueue("image-process", { postId }, { singletonKey: postId });
    expect(await boss.findJobs("image-process")).toHaveLength(1);
  });

  it("runs queued jobs in the worker", async () => {
    const seen: string[] = [];
    const probe: JobDefinition<{ keyBases: string[] }> = {
      name: "image-delete",
      async handler({ keyBases }) {
        seen.push(...keyBases);
      },
    };
    const queueSchema = `test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const worker = await startWorker({
      connectionString: url!,
      queueSchema,
      db,
      storage: new MemoryStorage(),
      log: silent,
      jobs: [probe],
    });
    try {
      await worker.queue.enqueue("image-delete", { keyBases: ["posts/test-a"] });
      for (let i = 0; i < 50 && seen.length === 0; i++)
        await new Promise((r) => setTimeout(r, 100));
      expect(seen).toEqual(["posts/test-a"]);
    } finally {
      await worker.stop();
      await db.execute(sql.raw(`drop schema "${queueSchema}" cascade`));
    }
  }, 15_000);
});
