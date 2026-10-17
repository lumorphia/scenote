import type { FastifyInstance } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { VISIBILITIES } from "@lumorphia-scenote/core/domain/posts";
import {
  listReviewQueue,
  readImageForReview,
  reviewPost,
} from "@lumorphia-scenote/core/domain/review";
import {
  dismissReport,
  hideReportedPost,
  listHiddenPosts,
  listOpenReports,
  REPORT_REASONS,
  restorePost,
} from "@lumorphia-scenote/core/domain/reports";
import { errorSchema, withErrors } from "../schemas/error.ts";

/** ID の形でないものは、無い投稿と同じに答える */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const postParams = z.object({ id: z.string().regex(UUID, "not found") });

const reasonBody = z.object({ reason: z.string().trim().min(1).max(500) });
const reportParams = z.object({ id: z.string().regex(UUID, "not found") });

/** 操作した運営者の Lumorphia の sub (requireAdmin を通ったあと) */
async function adminSubOf(app: FastifyInstance, userId: string): Promise<string> {
  const admin = await app.db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
  return admin!.lumorphiaSub;
}

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
      await reviewPost(
        { db: app.db, jobs: app.jobs },
        await adminSubOf(app, req.user!.id),
        req.params.id,
        req.body,
      );
      return reply.code(204).send(null);
    },
  );

  // 対応待ちの通報 (S7b-1、ADR-0021)。古い順。通報した人は見せない
  app.get(
    "/admin/reports",
    {
      schema: {
        tags: ["admin"],
        summary: "対応待ちの通報",
        response: withErrors({
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                postId: z.string(),
                reason: z.enum(REPORT_REASONS),
                detail: z.string().nullable(),
                createdAt: z.date(),
                post: z.object({
                  status: z.string(),
                  visibility: z.enum(VISIBILITIES),
                  title: z.string().nullable(),
                  author: z.object({ handle: z.string(), name: z.string() }),
                }),
                display: z.string(),
              }),
            ),
          }),
        }),
      },
      preValidation: [app.requireAdmin],
    },
    async () => ({
      items: (await listOpenReports({ db: app.db })).map((item) => ({
        ...item,
        display: reviewImage(item.postId, "display"),
      })),
    }),
  );

  app.post(
    "/admin/reports/:id/hide",
    {
      schema: {
        tags: ["admin"],
        summary: "通報された投稿を非表示にし、その投稿への通報を閉じる",
        params: reportParams,
        body: reasonBody,
        response: withErrors({ 204: z.null(), 409: errorSchema }),
      },
      preValidation: [app.requireAdmin],
    },
    async (req, reply) => {
      await hideReportedPost(
        { db: app.db, jobs: app.jobs },
        await adminSubOf(app, req.user!.id),
        req.params.id,
        req.body.reason,
      );
      return reply.code(204).send(null);
    },
  );

  app.post(
    "/admin/reports/:id/dismiss",
    {
      schema: {
        tags: ["admin"],
        summary: "通報を退ける",
        params: reportParams,
        body: reasonBody,
        response: withErrors({ 204: z.null(), 409: errorSchema }),
      },
      preValidation: [app.requireAdmin],
    },
    async (req, reply) => {
      await dismissReport(
        { db: app.db },
        await adminSubOf(app, req.user!.id),
        req.params.id,
        req.body.reason,
      );
      return reply.code(204).send(null);
    },
  );

  // 運営が非表示にした投稿と、戻す操作
  app.get(
    "/admin/hidden",
    {
      schema: {
        tags: ["admin"],
        summary: "非表示の投稿",
        response: withErrors({
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                visibility: z.enum(VISIBILITIES),
                title: z.string().nullable(),
                author: z.object({ handle: z.string(), name: z.string() }),
                reviewedAt: z.date().nullable(),
                thumb: z.string(),
              }),
            ),
          }),
        }),
      },
      preValidation: [app.requireAdmin],
    },
    async () => ({
      items: (await listHiddenPosts({ db: app.db })).map((item) => ({
        ...item,
        thumb: reviewImage(item.id, "thumb"),
      })),
    }),
  );

  app.post(
    "/admin/posts/:id/restore",
    {
      schema: {
        tags: ["admin"],
        summary: "非表示の投稿を公開に戻す",
        params: postParams,
        body: reasonBody,
        response: withErrors({ 204: z.null(), 409: errorSchema }),
      },
      preValidation: [app.requireAdmin],
    },
    async (req, reply) => {
      await restorePost(
        { db: app.db, jobs: app.jobs },
        await adminSubOf(app, req.user!.id),
        req.params.id,
        req.body.reason,
      );
      return reply.code(204).send(null);
    },
  );
};
