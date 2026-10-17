import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { MemoryStorage } from "@lumorphia/storage";
import { moderationConfigFromEnv } from "@lumorphia/moderation/image";
import { BLOCKED_TERMS } from "@lumorphia/moderation/text";
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
      // E2E と同じ色で決める判定器 (赤一色を保留にする)
      moderation: moderationConfigFromEnv({ IMAGE_MODERATION: "fake" }),
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
  async function post(cookie: string, fields: object = {}, bytes: Uint8Array = image) {
    const grant = (
      await askUpload(cookie, { mime: "image/webp", bytes: bytes.byteLength })
    ).json() as Grant;
    await put(grant, bytes);
    return (await createPost(cookie, grant.uploadId, fields)).json() as { postId: string };
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

  it("shows a public post to anyone", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie);
    await published(cookie, postId);
    expect((await readPost("", postId)).json()).toMatchObject({
      visibility: "public",
      isOwner: false,
    });
  });

  it("does not show a private post to another person", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { cookie: other } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie, { visibility: "private" });
    await published(cookie, postId);
    expect((await readPost(other, postId)).statusCode).toBe(404);
  });

  it("serves a private image only to its owner, and keeps it out of shared caches", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { cookie: other } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie, { visibility: "private" });
    const { image: made } = await published(cookie, postId);
    expect(made!.display).toBe(`/api/posts/${postId}/image/display`);
    const mine = await app.inject({ method: "GET", url: made!.display, headers: { cookie } });
    expect(mine.statusCode).toBe(200);
    expect(mine.headers["content-type"]).toBe("image/webp");
    expect(mine.headers["cache-control"]).toBe("private, no-store");
    expect(
      (await app.inject({ method: "GET", url: made!.display, headers: { cookie: other } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: "GET", url: made!.display })).statusCode).toBe(404);
  });

  it("holds a post the moderation finds unsafe, and shows it only to its owner", async () => {
    const red = new Uint8Array(
      await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .webp()
        .toBuffer(),
    );
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie, {}, red);
    const mine = await published(cookie, postId);
    expect(mine).toMatchObject({
      status: "held",
      image: { display: `/api/posts/${postId}/image/display` },
    });
    expect(
      (await app.inject({ method: "GET", url: mine.image!.display, headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    expect((await readPost("", postId)).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: mine.image!.display })).statusCode).toBe(404);
  });

  // NG 語 (S5g、ADR-0015)。語はパッケージの一覧から取る
  describe("blocked words", () => {
    const word = `テスト_${BLOCKED_TERMS.find((t) => t.match === "contains")!.term}`;
    const checkText = (cookie: string, payload: object) =>
      app.inject({
        method: "POST",
        url: "/api/posts/check-text",
        headers: mutating(cookie),
        payload,
      });

    it("checks the words before the image is sent, only for someone logged in", async () => {
      expect((await checkText("", { title: "テスト_夕焼け" })).statusCode).toBe(401);
    });

    it("answers that ordinary words are fine", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const res = await checkText(cookie, {
        title: "テスト_夕焼け",
        body: "テスト_本文",
        tags: ["テスト_海"],
        placeText: "テスト_浜辺",
      });
      expect(res.json()).toEqual({ blocked: null });
    });

    it("answers which field has a blocked word, without the word", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const res = await checkText(cookie, { body: word });
      expect(res.json()).toEqual({ blocked: "body" });
    });

    it("refuses a post with a blocked word, naming the field", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const grant = (
        await askUpload(cookie, { mime: "image/webp", bytes: image.byteLength })
      ).json() as Grant;
      await put(grant, image);
      const res = await createPost(cookie, grant.uploadId, { title: word });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.issues).toEqual([{ path: "title", message: expect.any(String) }]);
    });

    it("refuses tags with a blocked word when they are changed", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const { postId } = await post(cookie);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/posts/${postId}`,
        headers: mutating(cookie),
        payload: { tags: [word] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.issues).toEqual([{ path: "tags", message: expect.any(String) }]);
    });
  });

  it("lets the owner make a post private, and hides it at once", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie);
    await published(cookie, postId);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/posts/${postId}`,
      headers: mutating(cookie),
      payload: { visibility: "private" },
    });
    expect(res.statusCode).toBe(204);
    expect((await readPost("", postId)).statusCode).toBe(404);
  });

  it("keeps the tags and lets the owner change them", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie, { tags: ["#夕焼け", "旅"] });
    expect((await readPost(cookie, postId)).json().tags).toEqual([
      { name: "夕焼け", displayName: "夕焼け" },
      { name: "旅", displayName: "旅" },
    ]);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/posts/${postId}`,
      headers: mutating(cookie),
      payload: { tags: ["夜景"] },
    });
    expect(res.statusCode).toBe(204);
    expect((await readPost(cookie, postId)).json().tags).toEqual([
      { name: "夜景", displayName: "夜景" },
    ]);
  });

  it("offers the shooting places by region, and keeps the chosen one", async () => {
    await app.db.delete(schema.places);
    const [limsa] = await app.db
      .insert(schema.places)
      .values({
        sourceId: 28,
        regionSourceId: 22,
        regionName: "ラノシア",
        name: "リムサ・ロミンサ：上甲板層",
        kind: "town",
        syncedAt: new Date(),
      })
      .returning();
    const places = await app.inject({ method: "GET", url: "/api/places" });
    expect(places.json()).toEqual({
      regions: [
        {
          name: "ラノシア",
          places: [{ id: limsa!.id, name: "リムサ・ロミンサ：上甲板層", kind: "town" }],
        },
      ],
    });
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie, { placeId: limsa!.id });
    expect((await readPost(cookie, postId)).json().place).toEqual({
      id: limsa!.id,
      regionName: "ラノシア",
      name: "リムサ・ロミンサ：上甲板層",
    });
    await app.inject({
      method: "PATCH",
      url: `/api/posts/${postId}`,
      headers: mutating(cookie),
      payload: { place: { placeText: "テスト_ゴールドソーサー" } },
    });
    expect((await readPost(cookie, postId)).json().place).toEqual({
      id: null,
      regionName: null,
      name: "テスト_ゴールドソーサー",
    });
  });

  it("does not let someone else change the visibility", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { cookie: other } = await loginWithLumorphia(app, mock, lumorphiaUser());
    const { postId } = await post(cookie);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/posts/${postId}`,
      headers: mutating(other),
      payload: { visibility: "private" },
    });
    expect(res.statusCode).toBe(404);
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
