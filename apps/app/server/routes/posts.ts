import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createUpload, UPLOAD_MIMES } from "@lumorphia-scenote/core/domain/uploads";
import { createPost, getOwnPost } from "@lumorphia-scenote/core/domain/posts";
import { DomainError } from "@lumorphia-scenote/core";
import { withErrors } from "../schemas/error.ts";

const ownPostSchema = z.object({
  id: z.string(),
  status: z.enum(["processing", "published", "failed"]),
  failureReason: z.string().nullable(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  takenOn: z.string().nullable(),
  image: z
    .object({
      display: z.string(),
      thumb: z.string(),
      width: z.number(),
      height: z.number(),
      blurhash: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.date(),
});

/** 画像の受け取りと投稿 (docs/plan.md の S5a・S5b) */
export const postRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/uploads",
    {
      schema: {
        tags: ["posts"],
        summary: "画像を置く署名付き PUT の URL を出す",
        body: z.object({ mime: z.enum(UPLOAD_MIMES), bytes: z.number().int() }),
        response: withErrors({
          201: z.object({
            uploadId: z.string(),
            upload: z.object({
              url: z.string(),
              method: z.literal("PUT"),
              headers: z.record(z.string(), z.string()),
              expiresAt: z.date(),
            }),
          }),
        }),
      },
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      preValidation: [app.requireAuth],
    },
    async (req, reply) => {
      const grant = await createUpload(
        { db: app.db, storage: app.storage, maxBytes: app.env.UPLOAD_MAX_BYTES },
        req.user!.id,
        req.body,
      );
      return reply.code(201).send(grant);
    },
  );

  app.post(
    "/posts",
    {
      schema: {
        tags: ["posts"],
        summary: "置いた画像で投稿する。公開は派生画像ができてから",
        body: z.object({
          uploadId: z.uuid(),
          title: z.string().nullish(),
          body: z.string().nullish(),
          takenOn: z.string().nullish(),
          /** 現像のレシピ。中身はドメインが @lumorphia/editor-recipe で確かめる */
          recipe: z.unknown().optional(),
        }),
        response: withErrors({ 201: z.object({ postId: z.string() }) }),
      },
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      preValidation: [app.requireAuth],
    },
    async (req, reply) => {
      const created = await createPost(
        { db: app.db, storage: app.storage, jobs: app.jobs },
        req.user!.id,
        req.body,
      );
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/posts/:id",
    {
      schema: {
        tags: ["posts"],
        summary: "自分の投稿",
        params: z.object({ id: z.string() }),
        response: withErrors({ 200: ownPostSchema }),
      },
      preValidation: [app.requireAuth],
    },
    async (req, reply) => {
      reply.header("cache-control", "no-store");
      // ID の形でないものは、無い投稿と同じに答える
      if (!z.uuid().safeParse(req.params.id).success)
        throw new DomainError("not_found", "post not found");
      return getOwnPost(
        { db: app.db, imageBaseUrl: app.env.PUBLIC_IMAGE_BASE_URL },
        req.user!.id,
        req.params.id,
      );
    },
  );
};
