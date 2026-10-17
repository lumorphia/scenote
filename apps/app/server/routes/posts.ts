import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createUpload, UPLOAD_MIMES } from "@lumorphia-scenote/core/domain/uploads";
import { listPlaces } from "@lumorphia-scenote/core/domain/places";
import {
  changePlace,
  changeTags,
  changeVisibility,
  createPost,
  getPost,
  readPostImage,
  VISIBILITIES,
} from "@lumorphia-scenote/core/domain/posts";
import { DomainError } from "@lumorphia-scenote/core";
import { withErrors } from "../schemas/error.ts";

const postSchema = z.object({
  id: z.string(),
  status: z.enum(["processing", "published", "failed", "held"]),
  visibility: z.enum(VISIBILITIES),
  isOwner: z.boolean(),
  failureReason: z.string().nullable(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  takenOn: z.string().nullable(),
  tags: z.array(z.object({ name: z.string(), displayName: z.string() })),
  place: z
    .object({ id: z.string().nullable(), regionName: z.string().nullable(), name: z.string() })
    .nullable(),
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
          visibility: z.enum(VISIBILITIES).optional(),
          tags: z.array(z.string().max(200)).max(50).optional(),
          placeId: z.uuid().nullish(),
          placeText: z.string().max(500).nullish(),
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
    "/places",
    {
      schema: {
        tags: ["posts"],
        summary: "撮影場所の候補 (地域ごと)",
        response: withErrors({
          200: z.object({
            regions: z.array(
              z.object({
                name: z.string(),
                places: z.array(
                  z.object({
                    id: z.string(),
                    name: z.string(),
                    kind: z.enum(["town", "field", "inn", "housing"]),
                  }),
                ),
              }),
            ),
          }),
        }),
      },
    },
    async (_req, reply) => {
      // 地名は週 1 回しか変わらない。誰に返しても同じ
      reply.header("cache-control", "public, max-age=3600");
      return { regions: await listPlaces(app.db) };
    },
  );

  /** ID の形でないものは、無い投稿と同じに答える */
  const postId = (id: string) => {
    if (!z.uuid().safeParse(id).success) throw new DomainError("not_found", "post not found");
    return id;
  };

  app.get(
    "/posts/:id",
    {
      schema: {
        tags: ["posts"],
        summary: "投稿。見られるかは公開範囲で決まる (ADR-0004)",
        params: z.object({ id: z.string() }),
        response: withErrors({ 200: postSchema }),
      },
      preValidation: [app.optionalAuth],
    },
    async (req, reply) => {
      reply.header("cache-control", "no-store");
      return getPost(
        { db: app.db, imageBaseUrl: app.env.PUBLIC_IMAGE_BASE_URL },
        req.user?.id ?? null,
        postId(req.params.id),
      );
    },
  );

  app.patch(
    "/posts/:id",
    {
      schema: {
        tags: ["posts"],
        summary: "公開範囲やタグを変える。公開範囲を変えると画像は新しい URL に移る",
        params: z.object({ id: z.string() }),
        body: z.object({
          visibility: z.enum(VISIBILITIES).optional(),
          tags: z.array(z.string().max(200)).max(50).optional(),
          /** 撮影場所を付け直す。どちらも null なら外す */
          place: z
            .object({ placeId: z.uuid().nullish(), placeText: z.string().max(500).nullish() })
            .optional(),
        }),
        response: withErrors({ 204: z.null() }),
      },
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      preValidation: [app.requireAuth],
    },
    async (req, reply) => {
      const id = postId(req.params.id);
      if (req.body.tags) await changeTags({ db: app.db }, req.user!.id, id, req.body.tags);
      if (req.body.place) await changePlace({ db: app.db }, req.user!.id, id, req.body.place);
      if (req.body.visibility)
        await changeVisibility(
          { db: app.db, jobs: app.jobs },
          req.user!.id,
          id,
          req.body.visibility,
        );
      return reply.code(204).send(null);
    },
  );

  // 非公開の画像の中継 (ADR-0012)。共有のキャッシュ (Cloudflare) にもブラウザの保存にも載せない
  app.get(
    "/posts/:id/image/:variant",
    {
      schema: {
        tags: ["posts"],
        summary: "非公開の投稿の画像を本人に返す",
        params: z.object({ id: z.string(), variant: z.enum(["display", "thumb"]) }),
      },
      preValidation: [app.optionalAuth],
    },
    async (req, reply) => {
      const image = await readPostImage(
        { db: app.db, storage: app.storage },
        req.user?.id ?? null,
        postId(req.params.id),
        req.params.variant,
      );
      reply.header("cache-control", "private, no-store");
      reply.header("content-type", image.contentType);
      return reply.send(Buffer.from(image.body));
    },
  );
};
