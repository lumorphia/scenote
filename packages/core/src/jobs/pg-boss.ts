import { sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import type { ObjectStorage } from "@lumorphia/storage";
import type { Database } from "@lumorphia-scenote/db";
import { JOB_NAMES, type EnqueueOptions, type JobName, type JobQueue } from "./queue.ts";
import type { JobContext, JobDefinition, JobLog } from "./context.ts";

/**
 * 同じキー (singletonKey) で待っている・走っているジョブを 1 本にするキュー。投稿ごとの派生画像と画像の移動、定期の掃除と同期。
 * image-delete はキーを付けずに何本も入るので、ここに入れない (exclusive はキーの無いジョブ同士も 1 本にする)
 */
const EXCLUSIVE: ReadonlySet<JobName> = new Set([
  "image-process",
  "image-move",
  "upload-cleanup",
  "place-sync",
]);

/** 失敗は pg-boss が少し間をおいて 3 回までやり直す。走りっぱなしは 5 分で打ち切る */
export async function prepareQueues(boss: Pick<PgBoss, "createQueue">): Promise<void> {
  for (const name of JOB_NAMES)
    await boss.createQueue(name, {
      ...(EXCLUSIVE.has(name) ? { policy: "exclusive" as const } : {}),
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 300,
    });
}

export class PgBossJobQueue implements JobQueue {
  private readonly boss: Pick<PgBoss, "send">;
  constructor(boss: Pick<PgBoss, "send">) {
    this.boss = boss;
  }
  async enqueue(name: JobName, data: object, opts: EnqueueOptions = {}): Promise<void> {
    await this.boss.send(name, data, {
      ...(opts.startAfterSeconds !== undefined ? { startAfter: opts.startAfterSeconds } : {}),
      ...(opts.singletonKey ? { singletonKey: opts.singletonKey } : {}),
      ...(opts.retryLimit !== undefined ? { retryLimit: opts.retryLimit } : {}),
      ...(opts.transaction ? { db: transactionAdapter(opts.transaction) } : {}),
    });
  }
}

/** pg-boss が作る投入の SQL の $n を Drizzle のバインド値に置き換える。値は SQL に連結しない (lumorphia/accounts と同じ) */
function transactionAdapter(transaction: Database) {
  return {
    async executeSql(statement: string, values: unknown[] = []) {
      const chunks = statement.split(/(\$\d+)/).map((part) => {
        if (!/^\$\d+$/.test(part)) return sql.raw(part);
        const index = Number(part.slice(1)) - 1;
        if (index < 0 || index >= values.length) throw new Error("invalid pg-boss parameter");
        return sql`${values[index]}`;
      });
      const result = await transaction.execute(sql.join(chunks, sql.raw("")));
      return { rows: result.rows };
    },
  };
}

/** API は投入だけ。実行は worker */
export async function startJobQueue(connectionString: string, log: Pick<JobLog, "error">) {
  const boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    supervise: false,
    schedule: false,
  });
  boss.on("error", (err) => log.error({ err }, "job queue error"));
  try {
    await boss.start();
    await prepareQueues(boss);
  } catch (error) {
    await boss.stop({ graceful: false });
    throw error;
  }
  return {
    queue: new PgBossJobQueue(boss),
    stop: () => boss.stop({ graceful: true, timeout: 10_000 }),
  };
}

/** ジョブを 1 件ずつ実行する。停止は処理中のジョブを待つ */
export async function startWorker(options: {
  connectionString: string;
  /** テストは新しいスキーマを使い、ほかのジョブを触らない */
  queueSchema?: string;
  db: Database;
  storage: ObjectStorage;
  log: JobLog;
  jobs: readonly JobDefinition<never>[];
}) {
  const boss = new PgBoss({
    connectionString: options.connectionString,
    schema: options.queueSchema ?? "pgboss",
  });
  boss.on("error", (err) => options.log.error({ err }, "job queue error"));
  const ctx: JobContext = { db: options.db, storage: options.storage, log: options.log };
  try {
    await boss.start();
    await prepareQueues(boss);
    for (const job of options.jobs) {
      const run = job.handler as (data: unknown, ctx: JobContext) => Promise<void>;
      await boss.work(job.name, { batchSize: 1, pollingIntervalSeconds: 1 }, async (batch) => {
        for (const item of batch) {
          try {
            await run(item.data, ctx);
          } catch (err) {
            options.log.error({ err, jobId: item.id, jobName: job.name }, "job failed");
            throw err;
          }
        }
      });
      if (job.cron)
        await boss.schedule(job.name, job.cron, {}, { tz: "Asia/Tokyo", singletonKey: job.name });
    }
  } catch (error) {
    await boss.stop({ graceful: false });
    throw error;
  }
  return {
    queue: new PgBossJobQueue(boss) as JobQueue,
    async stop() {
      await boss.stop({ graceful: true, timeout: 25_000 });
    },
  };
}
