import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createStorage } from "@lumorphia/storage";
import { createDatabase } from "@lumorphia-scenote/db";
import { defaultJobs, startWorker } from "@lumorphia-scenote/core/jobs";
import { createLogger } from "@lumorphia/ops/logger";
import { handleShutdownSignals } from "./graceful-shutdown.ts";
import { storageConfig } from "./storage-config.ts";

const workerEnv = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  LOG_LEVEL: z.string().default("info"),
});

/**
 * ジョブを走らせる worker (派生画像、画像の削除、受け取りの掃除)。アプリは投入だけ (lumorphia/accounts と同じ)。
 * 画像の置き場所はアプリと同じ設定を読む (storage-config.ts)
 */
export async function createWorker(source: NodeJS.ProcessEnv = process.env) {
  const parsed = workerEnv.safeParse(source);
  if (!parsed.success)
    throw new Error(
      `invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  const env = parsed.data;
  const log = createLogger("worker", { level: env.LOG_LEVEL });
  const { db, close } = createDatabase(env.DATABASE_URL, {
    onIdleError: (err) => log.error({ err }, "worker database error"),
  });
  try {
    const worker = await startWorker({
      connectionString: env.DATABASE_URL,
      db,
      storage: createStorage(storageConfig(source)),
      log,
      jobs: defaultJobs(),
    });
    log.info({}, "worker started");
    return {
      log,
      async close() {
        try {
          await worker.stop();
        } finally {
          await close();
        }
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (import.meta.url === entryPoint) {
  const worker = await createWorker();
  handleShutdownSignals(worker, 30_000);
}
