import { describe, expect, it } from "vitest";
import { createWorker } from "./worker.ts";

const url = process.env.DATABASE_URL;

// 本番でジョブを走らせる worker (docs/plan.md の S5a)
describe.skipIf(!url)("worker (PostgreSQL)", () => {
  it("starts on the database and stops cleanly", async () => {
    const worker = await createWorker({
      NODE_ENV: "test",
      DATABASE_URL: url,
      STORAGE_DRIVER: "memory",
      LOG_LEVEL: "error",
    });
    await expect(worker.close()).resolves.toBeUndefined();
  }, 20_000);

  it("refuses to start without a database", async () => {
    await expect(createWorker({ NODE_ENV: "test", STORAGE_DRIVER: "memory" })).rejects.toThrow(
      /DATABASE_URL/,
    );
  });
});
