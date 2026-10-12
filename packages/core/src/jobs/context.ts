import type { ObjectStorage } from "@lumorphia/storage";
import type { Database } from "@lumorphia-scenote/db";
import type { JobName } from "./queue.ts";

export type JobLog = {
  info: (fields: object, message: string) => void;
  warn: (fields: object, message: string) => void;
  error: (fields: object, message: string) => void;
};

/** ジョブが使うもの。worker が作って渡す */
export type JobContext = { db: Database; storage: ObjectStorage; log: JobLog };

export type JobDefinition<TData = unknown> = {
  name: JobName;
  handler: (data: TData, ctx: JobContext) => Promise<void>;
  /** cron 式 (Asia/Tokyo)。あれば worker が起動時に schedule する */
  cron?: string;
};
