import { sql } from "drizzle-orm";
import type { EnqueueOptions, JobName, JobQueue } from "./queue.ts";
import type { JobContext, JobDefinition } from "./context.ts";

/** 投入したトランザクションの確定を待つ上限 */
const COMMIT_WAIT_MS = 30_000;

/**
 * 開発と E2E 専用 (JOBS_INLINE)。worker を立てずにアプリの中でジョブを走らせる。
 * pg-boss はジョブを行と同じトランザクションで入れるので、確定したときだけ見える。ここでも同じにするため、
 * トランザクションの中で投入されたら、その確定を待ってから走らせ、取り消されたら走らせない
 */
export class InlineJobQueue implements JobQueue {
  private readonly handlers: Map<JobName, JobDefinition<never>>;
  private readonly ctx: JobContext;
  private readonly running = new Set<Promise<void>>();
  constructor(ctx: JobContext, jobs: readonly JobDefinition<never>[]) {
    this.ctx = ctx;
    this.handlers = new Map(jobs.map((j) => [j.name, j]));
  }

  async enqueue(name: JobName, data: object, opts: EnqueueOptions = {}) {
    const job = this.handlers.get(name);
    if (!job) return;
    const run = (job.handler as (data: unknown, ctx: JobContext) => Promise<void>).bind(job);
    const txid = opts.transaction ? await currentTransactionId(opts.transaction) : null;
    const task: Promise<void> = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (txid && !(await this.committed(txid))) return;
      await run(data, this.ctx);
    })()
      .catch((err) => this.ctx.log.error({ err, jobName: name }, "inline job failed"))
      .finally(() => this.running.delete(task));
    this.running.add(task);
  }

  /** 閉じる前に走っているジョブを待つ (テストで DB を閉じたあとに書かないため) */
  async drain() {
    await Promise.all([...this.running]);
  }

  private async committed(txid: string): Promise<boolean> {
    for (const until = Date.now() + COMMIT_WAIT_MS; Date.now() < until;) {
      const result = await this.ctx.db.execute<{ status: string | null }>(
        sql`select pg_xact_status(${txid}::xid8) as status`,
      );
      const status = result.rows[0]?.status;
      if (status === "committed") return true;
      if (status !== "in progress") return false;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return false;
  }
}

async function currentTransactionId(tx: NonNullable<EnqueueOptions["transaction"]>) {
  const result = await tx.execute<{ id: string }>(sql`select pg_current_xact_id()::text as id`);
  return result.rows[0]!.id;
}
