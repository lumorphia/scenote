import fp from "fastify-plugin";
import {
  defaultJobs,
  InlineJobQueue,
  startJobQueue,
  type JobQueue,
} from "@lumorphia-scenote/core/jobs";

declare module "fastify" {
  interface FastifyInstance {
    jobs: JobQueue;
  }
}

/** ジョブの投入。開発と E2E はアプリの中で走らせ (JOBS_INLINE)、本番は pg-boss に入れて worker が走らせる */
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
