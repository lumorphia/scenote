import fp from "fastify-plugin";
import {
  defaultJobs,
  startJobQueue,
  type JobContext,
  type JobDefinition,
  type JobName,
  type JobQueue,
} from "@lumorphia-scenote/core/jobs";

declare module "fastify" {
  interface FastifyInstance {
    jobs: JobQueue;
  }
}

/**
 * 開発と E2E 専用 (JOBS_INLINE)。worker を立てずにアプリの中でジョブを走らせる。
 * 投入のトランザクションが確定してから走るよう、次の周回に回す (lumorphia/prismtone と同じ)
 */
class InlineJobQueue implements JobQueue {
  private readonly handlers: Map<JobName, JobDefinition<never>>;
  private readonly ctx: JobContext;
  private readonly running = new Set<Promise<void>>();
  constructor(ctx: JobContext, jobs: readonly JobDefinition<never>[]) {
    this.ctx = ctx;
    this.handlers = new Map(jobs.map((j) => [j.name, j]));
  }
  async enqueue(name: JobName, data: object) {
    const job = this.handlers.get(name);
    if (!job) return;
    const run = (job.handler as (data: unknown, ctx: JobContext) => Promise<void>).bind(job);
    const task = new Promise<void>((resolve) => setTimeout(resolve, 0))
      .then(() => run(data, this.ctx))
      .catch((err) => this.ctx.log.error({ err, jobName: name }, "inline job failed"))
      .finally(() => this.running.delete(task));
    this.running.add(task);
  }
  /** 閉じる前に走っているジョブを待つ (テストで DB を閉じたあとに書かないため) */
  async drain() {
    await Promise.all([...this.running]);
  }
}

export const jobsPlugin = fp<{ jobs?: JobQueue }>(
  async (app, opts) => {
    if (opts.jobs) {
      app.decorate("jobs", opts.jobs);
      return;
    }
    if (app.env.JOBS_INLINE) {
      const queue = new InlineJobQueue(
        { db: app.db, storage: app.storage, log: app.log },
        defaultJobs(),
      );
      app.decorate("jobs", queue);
      app.addHook("onClose", async () => queue.drain());
      app.log.warn("inline jobs enabled: jobs run inside the app (JOBS_INLINE)");
      return;
    }
    const { queue, stop } = await startJobQueue(app.env.DATABASE_URL, app.log);
    app.decorate("jobs", queue);
    app.addHook("onClose", async () => stop());
  },
  { name: "jobs", dependencies: ["db", "storage"] },
);
