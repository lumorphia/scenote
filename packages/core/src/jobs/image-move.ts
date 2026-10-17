import { and, eq } from "drizzle-orm";
import { schema } from "@lumorphia-scenote/db";
import { imageCacheControl, variantContentType, VARIANTS, variantKey } from "../storage-keys.ts";
import type { JobContext, JobDefinition } from "./context.ts";

export type ImageMoveData = { postId: string };

/** 移している間に何度も変えられても、ここで打ち切る (次の変更でまたジョブが入る) */
const MAX_ROUNDS = 5;

/**
 * 公開範囲を変えた投稿の画像を、新しいキー (pending_image_key_base) に移し、古いものを消す (ADR-0004、ADR-0012)。
 * 移している間にもう一度変わったら、置いた分を消して最後の行き先を追う。同じ投稿のジョブは 1 本なので
 * (pg-boss の exclusive)、2 本目を待たずにこのジョブの中で追いかける
 */
export const imageMoveJob: JobDefinition<ImageMoveData> = {
  name: "image-move",
  async handler({ postId }, ctx) {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (await moveOnce(postId, ctx)) return;
    }
    ctx.log.warn({ postId }, "image move gave up after repeated changes");
  },
};

/** 1 回移す。移し終えたか、移すものが無ければ true。途中で行き先が変わったら false */
async function moveOnce(postId: string, { db, storage, log }: JobContext): Promise<boolean> {
  const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
  if (!post?.pendingImageKeyBase) return true;
  const from = post.imageKeyBase;
  const to = post.pendingImageKeyBase;
  for (const variant of VARIANTS) {
    const body = await storage.get(variantKey(from, variant));
    if (!body) continue;
    await storage.put({
      key: variantKey(to, variant),
      body,
      contentType: variantContentType(variant),
      cacheControl: imageCacheControl(to),
    });
  }
  const [moved] = await db
    .update(schema.posts)
    .set({ imageKeyBase: to, pendingImageKeyBase: null })
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.pendingImageKeyBase, to)))
    .returning({ id: schema.posts.id });
  if (!moved) {
    await storage.delete(VARIANTS.map((v) => variantKey(to, v)));
    return false;
  }
  await storage.delete(VARIANTS.map((v) => variantKey(from, v)));
  log.info({ postId }, "images moved");
  return true;
}
