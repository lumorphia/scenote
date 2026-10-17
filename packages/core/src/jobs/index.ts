import type { ModerationConfig } from "@lumorphia/moderation/image";
import { createDefaultImageProcessJob } from "./image-process.ts";
import { imageDeleteJob, uploadCleanupJob } from "./cleanup.ts";
import { imageMoveJob } from "./image-move.ts";
import { createPlaceSyncJob } from "./place-sync.ts";
import type { PlaceSource } from "../adapters/xivapi-places.ts";
import type { JobDefinition } from "./context.ts";

export * from "./queue.ts";
export * from "./context.ts";
export * from "./pg-boss.ts";
export { InlineJobQueue } from "./inline.ts";
export {
  createDefaultImageProcessJob,
  createImageProcessJob,
  PRIVATE_IMAGE_CACHE_CONTROL,
  PUBLIC_IMAGE_CACHE_CONTROL,
  type ImageProcessData,
} from "./image-process.ts";
export { imageDeleteJob, uploadCleanupJob, type ImageDeleteData } from "./cleanup.ts";
export { imageMoveJob, type ImageMoveData } from "./image-move.ts";
export { createPlaceSyncJob } from "./place-sync.ts";

/**
 * worker と、開発のアプリの中 (JOBS_INLINE) で走らせるジョブ。地名の同期は worker だけ
 * (アプリの中では cron を回さない。開発は scripts の places:sync で入れる)。
 * 画像の判定器は moderation で選ぶ (IMAGE_MODERATION、ADR-0014)
 */
export function defaultJobs(options: {
  moderation: ModerationConfig;
  placeSource?: PlaceSource;
}): JobDefinition<never>[] {
  return [
    ...(options.placeSource ? [createPlaceSyncJob(options.placeSource)] : []),
    createDefaultImageProcessJob(options.moderation),
    imageMoveJob,
    imageDeleteJob,
    uploadCleanupJob,
  ] as JobDefinition<never>[];
}
