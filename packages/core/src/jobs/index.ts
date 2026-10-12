import { SharpImageProcessor } from "@lumorphia/media";
import { createImageProcessJob } from "./image-process.ts";
import { imageDeleteJob, uploadCleanupJob } from "./cleanup.ts";
import type { JobDefinition } from "./context.ts";

export * from "./queue.ts";
export * from "./context.ts";
export * from "./pg-boss.ts";
export { InlineJobQueue } from "./inline.ts";
export {
  createImageProcessJob,
  PUBLIC_IMAGE_CACHE_CONTROL,
  type ImageProcessData,
} from "./image-process.ts";
export { imageDeleteJob, uploadCleanupJob, type ImageDeleteData } from "./cleanup.ts";

/** worker と、開発のアプリの中 (JOBS_INLINE) で走らせるジョブ */
export function defaultJobs(): JobDefinition<never>[] {
  return [
    createImageProcessJob(new SharpImageProcessor()),
    imageDeleteJob,
    uploadCleanupJob,
  ] as JobDefinition<never>[];
}
