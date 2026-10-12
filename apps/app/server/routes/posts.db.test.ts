import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { MemoryStorage } from "@lumorphia/storage";
import { schema } from "@lumorphia-scenote/db";
import { startMockIssuer, type MockIssuer } from "@lumorphia/e2e/mock-issuer";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { buildApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { loginWithLumorphia } from "../test/lumorphia-login.ts";

const url = process.env.DATABASE_URL;
const CLIENT_ID = "test-scenote";

type Grant = {
  uploadId: string;
  upload: { url: string; method: string; headers: Record<string, string> };
};
type OwnPost = {
  id: string;
  status: string;
  image: { display: string; thumb: string; width: number } | null;
};

// 画像の受け取りから公開まで (docs/plan.md の S5a)。ジョブはアプリの中で走る (JOBS_INLINE)
describe.skipIf(!url)("posting an image (PostgreSQL)", () => {
  let app: FastifyInstance;
  let mock: MockIssuer;
  let image: Uint8Array;

  beforeAll(async () => {
    mock = await startMockIssuer({
      clientId: CLIENT_ID,
      service: "scenote",
      tls: {
        cert: process.env.SCENOTE_TEST_LUMORPHIA_CERT!,
        key: process.env.SCENOTE_TEST_LUMORPHIA_KEY!,
      },
      // このテストは back-channel logout を送らないので、アプリには届かなくてよい
      appBaseUrl: "http://127.0.0.1:9",
    });
    app = await buildApp({
      env: loadEnv({
        NODE_ENV: "test",
        DATABASE_URL: url,
        LUMORPHIA_ISSUER: mock.issuer,
        LUMORPHIA_CLIENT_ID: CLIENT_ID,
        LUMORPHIA_CLIENT_SECRET: "test-secret",
        LOG_LEVEL: "error",
      }),
      storage: new MemoryStorage({ publicBaseUrl: "/_storage" }),
    });
    image = new Uint8Array(
      await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 120, b: 90 } },
      })
        .webp()
        .toBuffer(),
    );
  });
  afterAll(async () => {
    await app?.close();
    await mock?.close();
  });
  beforeEach(async () => {
    await app.db.delete(schema.users);
  });

  const base = () => new URL(app.env.AUTH_BASE_URL);
  const mutating = (cookie: string) => ({
    cookie,
    origin: base().origin,
    host: base().host,
    "content-type": "application/json",
  });
  const askUpload = (cookie: string, payload: object) =>
    app.inject({ method: "POST", url: "/api/uploads", headers: mutating(cookie), payload });
  const put = (grant: Grant, body: Uint8Array) =>
    app.inject({
      method: "PUT",
      url: grant.upload.url,
      headers: { ...grant.upload.headers, origin: base().origin, host: base().host },
      payload: Buffer.from(body),
    });
  const createPost = (cookie: string, uploadId: string, fields: object = {}) =>
    app.inject({
      method: "POST",
      url: "/api/posts",
      headers: mutating(cookie),
      payload: { uploadId, ...fields },
    });
  const readPost = (cookie: string, id: string) =>
    app.inject({ method: "GET", url: `/api/posts/${id}`, headers: { cookie } });
  async function published(cookie: string, id: string): Promise<OwnPost> {
    for (let i = 0; i < 100; i++) {
      const post = readPost(cookie, id).then((r) => r.json() as OwnPost);
      if ((await post).status !== "processing") return post;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("the post stayed processing");
  }
  async function post(cookie: string) {
    const grant = (
      await askUpload(cookie, { mime: "image/webp", bytes: image.byteLength })
    ).json() as Grant;
    await put(grant, image);
    return (await createPost(cookie, grant.uploadId)).json() as { postId: string };
  }

  it("refuses to hand out an upload without a login", async () => {
    expect((await askUpload("", { mime: "image/webp", bytes: 10 })).statusCode).toBe(401);
  });

  it("hands out a place to put the image", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const res = await askUpload(cookie, { mime: "image/webp", bytes: image.byteLength });
    expect(res.statusCode).toBe(201);
    expect((res.json() as Grant).upload.method).toBe("PUT");
  });

  it("refuses a file type the editor does not write", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    expect((await askUpload(cookie, { mime: "image/gif", bytes: 10 })).statusCode).toBe(400);
  });

  it("refuses a file over the limit", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const res = await askUpload(cookie, {
      mime: "image/webp",
      bytes: app.env.UPLOAD_MAX_BYTES + 1,
    });
    expect(res.statusCode).toBe(400);
  });

  it("publishes the post once its images are made", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie);
    expect(await published(cookie, postId)).toMatchObject({
      status: "published",
      image: { width: 800 },
    });
  });

  it("keeps the title, the body and the day the photo was taken", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const grant = (
      await askUpload(cookie, { mime: "image/webp", bytes: image.byteLength })
    ).json() as Grant;
    await put(grant, image);
    const { postId } = (
      await createPost(cookie, grant.uploadId, {
        title: "テスト_夕焼け",
        body: "テスト_本文",
        takenOn: "2026-09-30",
      })
    ).json() as { postId: string };
    expect((await readPost(cookie, postId)).json()).toMatchObject({
      title: "テスト_夕焼け",
      body: "テスト_本文",
      takenOn: "2026-09-30",
    });
  });

  it("serves the made image", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie);
    const { image: made } = await published(cookie, postId);
    const res = await app.inject({ method: "GET", url: made!.display });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/webp");
  });

  it("does not show a post to another person", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { cookie: other } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie);
    expect((await readPost(other, postId)).statusCode).toBe(404);
  });

  it("answers 404 for a post ID that is not one", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    expect((await readPost(cookie, "not-a-post")).statusCode).toBe(404);
  });

  it("refuses to post an image that was never put", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const grant = (await askUpload(cookie, { mime: "image/webp", bytes: 10 })).json() as Grant;
    expect((await createPost(cookie, grant.uploadId)).statusCode).toBe(400);
  });
});
