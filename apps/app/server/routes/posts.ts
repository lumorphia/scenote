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
import { checkText } from "@lumorphia-scenote/core/domain/blocked-text";
import {
  getPublicProfile,
  listPublicPosts,
  MAX_PAGE_SIZE,
} from "@lumorphia-scenote/core/domain/browse";
import { deletePost, listMyPosts } from "@lumorphia-scenote/core/domain/my-posts";
import {
  createReport,
  MAX_REPORT_DETAIL_LENGTH,
  REPORT_REASONS,
} from "@lumorphia-scenote/core/domain/reports";
import { errorSchema, withErrors } from "../schemas/error.ts";

const postSchema = z.object({
  id: z.string(),
  status: z.enum(["processing", "published", "failed", "held", "hidden"]),
  visibility: z.enum(VISIBILITIES),
  isOwner: z.boolean(),
  failureReason: z.string().nullable(),
  author: z.object({ handle: z.string(), name: z.string(), image: z.string().nullable() }),
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
  publishedAt: z.date().nullable(),
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
      preValidation: [app.requireConsent],
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
      preValidation: [app.requireConsent],
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

  // 投稿画面が、画像を送る前に NG 語を確かめる (受け取りの枠を無駄にしない。ADR-0015)。語の一覧は返さない
  app.post(
    "/posts/check-text",
    {
      schema: {
        tags: ["posts"],
        summary: "タイトル・本文・タグ・撮影場所に使えない語が無いか確かめる",
        body: z.object({
          title: z.string().max(500).nullish(),
          body: z.string().max(5000).nullish(),
          tags: z.array(z.string().max(200)).max(50).optional(),
          placeText: z.string().max(500).nullish(),
        }),
        response: withErrors({
          200: z.object({ blocked: z.enum(["title", "body", "tags", "placeText"]).nullable() }),
        }),
      },
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      preValidation: [app.requireConsent],
    },
    async (req) => ({ blocked: await checkText(app.db, req.body) }),
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

  // 公開の投稿の一覧 (S6a、ADR-0016)。ログインは要らない
  app.get(
    "/posts",
    {
      schema: {
        tags: ["posts"],
        summary: "公開の投稿を新しい順に。タグか投稿者で絞れる",
        querystring: z.object({
          cursor: z.string().max(500).optional(),
          limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
          /** タグで絞る (S6c)。書き方のゆれはそろえる */
          tag: z.string().max(200).optional(),
          /** 投稿者の handle で絞る (S6c) */
          author: z.string().max(64).optional(),
        }),
        response: withErrors({
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                title: z.string().nullable(),
                thumb: z.string(),
                width: z.number(),
                height: z.number(),
                blurhash: z.string().nullable(),
                author: z.object({
                  handle: z.string(),
                  name: z.string(),
                  image: z.string().nullable(),
                }),
                tags: z.array(z.object({ name: z.string(), displayName: z.string() })),
                publishedAt: z.date(),
              }),
            ),
            nextCursor: z.string().nullable(),
          }),
        }),
      },
    },
    async (req) =>
      listPublicPosts({ db: app.db, imageBaseUrl: app.env.PUBLIC_IMAGE_BASE_URL }, req.query),
  );

  // 利用者のページの見出し (S6c)。退会中の人と、無い handle は 404
  app.get(
    "/users/:handle",
    {
      schema: {
        tags: ["posts"],
        summary: "利用者の handle・表示名・アイコン",
        params: z.object({ handle: z.string().max(64) }),
        response: withErrors({
          200: z.object({ handle: z.string(), name: z.string(), image: z.string().nullable() }),
        }),
      },
    },
    async (req) => getPublicProfile(app.db, req.params.handle),
  );

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
      preValidation: [app.requireConsent],
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

  // 投稿の削除 (S6d)。本人だけ。行はすぐに消え、画像は worker が消す。戻せない
  app.delete(
    "/posts/:id",
    {
      schema: {
        tags: ["posts"],
        summary: "自分の投稿を消す",
        params: z.object({ id: z.string() }),
        response: withErrors({ 204: z.null() }),
      },
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      preValidation: [app.requireAuth],
    },
    async (req, reply) => {
      await deletePost({ db: app.db, jobs: app.jobs }, req.user!.id, postId(req.params.id));
      return reply.code(204).send(null);
    },
  );

  // 通報 (S7b-1、ADR-0021)。ログインが要る。見えている他人の投稿だけ
  app.post(
    "/posts/:id/reports",
    {
      schema: {
        tags: ["posts"],
        summary: "投稿を通報する",
        params: z.object({ id: z.string() }),
        body: z.object({
          reason: z.enum(REPORT_REASONS),
          detail: z
            .string()
            .max(MAX_REPORT_DETAIL_LENGTH * 4)
            .nullish(),
        }),
        response: withErrors({ 204: z.null(), 409: errorSchema }),
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      preValidation: [app.requireConsent],
    },
    async (req, reply) => {
      await createReport({ db: app.db }, req.user!.id, postId(req.params.id), req.body);
      return reply.code(204).send(null);
    },
  );

  // マイページ (S6d)。自分の投稿を、公開範囲も状態も問わず新しい順に
  app.get(
    "/me/posts",
    {
      schema: {
        tags: ["posts"],
        summary: "自分の投稿の一覧",
        querystring: z.object({
          cursor: z.string().max(500).optional(),
          limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
        }),
        response: withErrors({
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                status: z.enum(["processing", "published", "failed", "held", "hidden"]),
                visibility: z.enum(VISIBILITIES),
                title: z.string().nullable(),
                thumb: z.string().nullable(),
                width: z.number().nullable(),
                height: z.number().nullable(),
                createdAt: z.date(),
              }),
            ),
            nextCursor: z.string().nullable(),
          }),
        }),
      },
      preValidation: [app.requireAuth],
    },
    async (req, reply) => {
      // 本人の一覧 (非公開を含む) を共有のキャッシュに載せない
      reply.header("cache-control", "private, no-store");
      return listMyPosts(
        { db: app.db, imageBaseUrl: app.env.PUBLIC_IMAGE_BASE_URL },
        req.user!.id,
        req.query,
      );
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
