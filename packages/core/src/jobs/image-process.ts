import { eq } from "drizzle-orm";
import { ImageRejectedError, SharpImageProcessor, type ImageProcessor } from "@lumorphia/media";
import {
  createImageModerator,
  decideModeration,
  DEFAULT_MODERATION_THRESHOLDS,
  type ImageModerator,
  type ModerationConfig,
  type ModerationThresholds,
} from "@lumorphia/moderation/image";
import { schema } from "@lumorphia-scenote/db";
import {
  imageCacheControl,
  isPrivateKey,
  newImageKeyBase,
  tmpKey,
  variantContentType,
  VARIANTS,
  variantKey,
} from "../storage-keys.ts";
import { makeOgpImage } from "../ogp-image.ts";
import type { JobContext, JobDefinition } from "./context.ts";

export type ImageProcessData = { postId: string };

export { PRIVATE_IMAGE_CACHE_CONTROL, PUBLIC_IMAGE_CACHE_CONTROL } from "../storage-keys.ts";

export type ImageProcessOptions = {
  /** 自動モデレーション (ADR-0014)。無ければ判定せず公開する (開発の既定) */
  moderator?: ImageModerator;
  thresholds?: ModerationThresholds;
};

/**
 * 受け取った画像 (tmp/{uploadId}) を検証・再エンコードし、display と thumb を置いて投稿を公開する。
 * 再エンコードで EXIF と WebP の拡張チャンク (再編集用 WebP の元画像を含む) は落ちる (ADR-0003)。
 * moderator があれば display を判定し、held なら公開せず、画像を非公開の置き場所に置く (ADR-0014)。
 * 受け取った画像は、受け付けても断っても消す。同じ投稿に 2 回走っても、processing でなければ何もしない
 */
export function createImageProcessJob(
  processor: ImageProcessor,
  { moderator, thresholds = DEFAULT_MODERATION_THRESHOLDS }: ImageProcessOptions = {},
): JobDefinition<ImageProcessData> {
  return {
    name: "image-process",
    async handler({ postId }, ctx) {
      const { db, storage, log } = ctx;
      const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
      if (!post || post.status !== "processing") return;
      const upload = post.uploadId
        ? await db.query.uploads.findFirst({ where: eq(schema.uploads.id, post.uploadId) })
        : undefined;
      const bytes = upload ? await storage.get(tmpKey(upload.id)) : null;
      if (!upload || !bytes) return fail(ctx, postId, "missing_upload");

      let variants;
      try {
        variants = await processor.process(bytes, upload.declaredMime);
      } catch (e) {
        if (!(e instanceof ImageRejectedError)) throw e;
        await fail(ctx, postId, e.reason);
        await storage.delete([tmpKey(upload.id)]);
        return;
      }

      // 判定は派生画像に対して行う (前処理を二重にしない。lumorphia/prismtone と同じ)。振り分けはパッケージが決める
      const judgement = moderator ? await moderator.classify(variants.display) : null;
      const state = judgement ? decideModeration([judgement], thresholds).state : null;
      const held = state === "held";
      // 保留した画像は、公開・限定公開でも配信元から読めない置き場所に置く
      const base =
        held && !isPrivateKey(post.imageKeyBase)
          ? newImageKeyBase(postId, "private")
          : post.imageKeyBase;

      // 共有用の画像も同じ置き場所に置く。公開範囲の移動 (image-move) と削除に一緒についていく (ADR-0018)
      const files = {
        display: variants.display,
        thumb: variants.thumb,
        ogp: await makeOgpImage(variants.display),
      };
      for (const variant of VARIANTS)
        await storage.put({
          key: variantKey(base, variant),
          body: files[variant],
          contentType: variantContentType(variant),
          cacheControl: imageCacheControl(base),
        });
      const [updated] = await db
        .update(schema.posts)
        .set({
          status: held ? "held" : "published",
          imageKeyBase: base,
          ...(judgement
            ? {
                moderationState: state,
                moderationScore: judgement.score,
                moderationLabels: judgement.labels,
                moderatedAt: new Date(),
              }
            : {}),
          width: variants.width,
          height: variants.height,
          blurhash: variants.blurhash,
          bytesDisplay: variants.display.byteLength,
          bytesThumb: variants.thumb.byteLength,
          uploadId: null,
          failureReason: null,
          publishedAt: held ? null : new Date(),
        })
        .where(eq(schema.posts.id, postId))
        .returning({ id: schema.posts.id });
      await storage.delete([tmpKey(upload.id)]);
      // 仕上げている間に投稿が消された (本人の削除、退会の物理削除)。置いた画像を残さない
      if (!updated) {
        await storage.delete(VARIANTS.map((v) => variantKey(base, v)));
        log.info({ postId }, "post deleted while its images were made");
        return;
      }
      log.info(
        {
          postId,
          moderationState: state,
          moderationScore: judgement?.score,
          moderationRender: judgement?.labels.render,
        },
        "image processed",
      );
    },
  };
}

async function fail(ctx: JobContext, postId: string, reason: string) {
  await ctx.db
    .update(schema.posts)
    .set({ status: "failed", failureReason: reason, uploadId: null })
    .where(eq(schema.posts.id, postId));
  ctx.log.warn({ postId, reason }, "image rejected");
}

/**
 * worker とアプリの中 (JOBS_INLINE) が使う既定の定義 (Sharp と、環境変数で選んだ判定器)。
 * 判定器はモデルの読み込みが重いので、最初のジョブで作って使い回す。作れなかったら次のジョブで作り直す
 */
export function createDefaultImageProcessJob(
  moderation: ModerationConfig,
): JobDefinition<ImageProcessData> {
  let job: Promise<JobDefinition<ImageProcessData>> | null = null;
  return {
    name: "image-process",
    async handler(data, ctx) {
      job ??= (async () => {
        const moderator = await createImageModerator(moderation);
        return createImageProcessJob(new SharpImageProcessor(), {
          ...(moderator ? { moderator } : {}),
          thresholds: moderation.thresholds,
        });
      })().catch((error: unknown) => {
        job = null;
        throw error;
      });
      return (await job).handler(data, ctx);
    },
  };
}
