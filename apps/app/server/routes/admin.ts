import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { VISIBILITIES } from "@lumorphia-scenote/core/domain/posts";
import {
  listReviewQueue,
  readImageForReview,
  reviewPost,
} from "@lumorphia-scenote/core/domain/review";
import { errorSchema, withErrors } from "../schemas/error.ts";

/** ID の形でないものは、無い投稿と同じに答える */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const postParams = z.object({ id: z.string().regex(UUID, "not found") });

/** 管理画面が投稿の画像を開く道。保留した投稿の画像は非公開の置き場所にあるので、アプリが中継する */
const reviewImage = (id: string, variant: "display" | "thumb") =>
  `/api/admin/posts/${id}/image/${variant}`;

/**
 * 管理画面の API (S7a、ADR-0019)。どれも requireAdmin を通す。
 * 外側は Cloudflare Access が /admin と /api/admin を守る (本番の runbook)
 */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  // 画面が、管理画面を出してよいかを確かめる
  app.get(
    "/admin/me",
    {
      schema: {
        tags: ["admin"],
        summary: "管理画面に入れるか",
        response: withErrors({ 200: z.object({ ok: z.literal(true) }) }),
      },
      preValidation: [app.requireAdmin],
    },
    async () => ({ ok: true as const }),
  );

  // 確認待ち (S7a-2、ADR-0020)。保留と、要確認でまだ確かめていないもの。古い順
  app.get(
    "/admin/reviews",
    {
      schema: {
        tags: ["admin"],
        summary: "確認待ちの投稿",
        response: withErrors({
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                status: z.enum(["processing", "published", "failed", "held", "hidden"]),
                visibility: z.enum(VISIBILITIES),
                moderationState: z.enum(["clear", "flagged", "held"]).nullable(),
                moderationScore: z.number().nullable(),
                moderationLabels: z.record(z.string(), z.number()).nullable(),
                title: z.string().nullable(),
                body: z.string().nullable(),
                author: z.object({ handle: z.string(), name: z.string() }),
                createdAt: z.date(),
                display: z.string(),
                thumb: z.string(),
              }),
            ),
          }),
        }),
      },
      preValidation: [app.requireAdmin],
    },
    async () => ({
      items: (await listReviewQueue({ db: app.db })).map((item) => ({
        ...item,
        display: reviewImage(item.id, "display"),
        thumb: reviewImage(item.id, "thumb"),
      })),
    }),
  );

  app.get(
    "/admin/posts/:id/image/:variant",
    {
      schema: {
        tags: ["admin"],
        summary: "確かめるための投稿の画像",
        params: postParams.extend({ variant: z.enum(["display", "thumb"]) }),
      },
      preValidation: [app.requireAdmin],
    },
    async (req, reply) => {
      const image = await readImageForReview(
        { db: app.db, storage: app.storage },
        req.params.id,
        req.params.variant,
      );
      return reply.header("content-type", image.contentType).send(Buffer.from(image.body));
    },
  );

  // 確かめた結果。理由は必須で、操作と同じトランザクションで記録する
  app.post(
    "/admin/posts/:id/review",
    {
      schema: {
        tags: ["admin"],
        summary: "確認待ちの投稿を公開するか非表示にする",
        params: postParams,
        body: z.object({
          decision: z.enum(["approve", "reject"]),
          reason: z.string().trim().min(1).max(500),
        }),
        response: withErrors({ 204: z.null(), 409: errorSchema }),
      },
      preValidation: [app.requireAdmin],
    },
    async (req, reply) => {
      const admin = await app.db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, req.user!.id),
      });
      await reviewPost(
        { db: app.db, jobs: app.jobs },
        admin!.lumorphiaSub,
        req.params.id,
        req.body,
      );
      return reply.code(204).send(null);
    },
  );
};
