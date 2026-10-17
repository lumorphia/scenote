import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { MemoryStorage } from "@lumorphia/storage";
import { schema } from "@lumorphia-scenote/db";
import { startMockIssuer, type MockIssuer } from "@lumorphia/e2e/mock-issuer";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { buildApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { loginWithLumorphia } from "../test/lumorphia-login.ts";
import { newImageKeyBase, variantKey } from "@lumorphia-scenote/core/storage-keys";

const url = process.env.DATABASE_URL;
const CLIENT_ID = "test-scenote";
const ADMIN_SUB = randomUUID();

// 管理画面の入口 (S7a、ADR-0019)。許可リストにいない人には、管理画面が無いのと同じに答える
describe.skipIf(!url)("the admin API (PostgreSQL)", () => {
  let app: FastifyInstance;
  let mock: MockIssuer;
  const storage = new MemoryStorage({ publicBaseUrl: "/_storage" });

  beforeAll(async () => {
    mock = await startMockIssuer({
      clientId: CLIENT_ID,
      service: "scenote",
      tls: {
        cert: process.env.SCENOTE_TEST_LUMORPHIA_CERT!,
        key: process.env.SCENOTE_TEST_LUMORPHIA_KEY!,
      },
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
        ADMIN_SUBS: ADMIN_SUB,
      }),
      storage,
    });
  });
  afterAll(async () => {
    await app?.close();
    await mock?.close();
  });
  beforeEach(async () => {
    await app.db.delete(schema.users);
  });

  const me = (cookie: string) =>
    app.inject({ method: "GET", url: "/api/admin/me", headers: { cookie } });

  it("lets in an operator on the list", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser({ sub: ADMIN_SUB }));
    const res = await me(cookie);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("answers 404 to someone logged in but not on the list", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
    expect((await me(cookie)).statusCode).toBe(404);
  });

  it("answers 404 to a visitor", async () => {
    expect((await me("")).statusCode).toBe(404);
  });
  // 保留・要確認の投稿の確認 (S7a-2、ADR-0020)
  describe("reviewing", () => {
    const base = () => new URL(app.env.AUTH_BASE_URL);
    /** 保留した投稿を、派生画像ができたところまで直接置く */
    async function heldPost() {
      const user = lumorphiaUser();
      const { cookie } = await loginWithLumorphia(app, mock, user);
      const owner = await app.db.query.users.findFirst({
        where: eq(schema.users.lumorphiaSub, user.sub),
      });
      const id = randomUUID();
      const imageKeyBase = newImageKeyBase(id, "private");
      await app.db.insert(schema.posts).values({
        id,
        userId: owner!.id,
        status: "held",
        visibility: "public",
        imageKeyBase,
        width: 1600,
        height: 900,
        moderationState: "held",
      });
      await storage.put({
        key: variantKey(imageKeyBase, "display"),
        body: new Uint8Array([4]),
        contentType: "image/webp",
      });
      return { id, ownerCookie: cookie };
    }
    const admin = () => loginWithLumorphia(app, mock, lumorphiaUser({ sub: ADMIN_SUB }));
    const decide = (cookie: string, id: string, payload: object) =>
      app.inject({
        method: "POST",
        url: `/api/admin/posts/${id}/review`,
        headers: {
          cookie,
          origin: base().origin,
          host: base().host,
          "content-type": "application/json",
        },
        payload,
      });

    it("lists the waiting posts with an image the operator can open", async () => {
      const { id } = await heldPost();
      const { cookie } = await admin();
      const list = await app.inject({
        method: "GET",
        url: "/api/admin/reviews",
        headers: { cookie },
      });
      const item = (list.json() as { items: { id: string; display: string }[] }).items[0]!;
      expect(item).toMatchObject({ id, display: `/api/admin/posts/${id}/image/display` });
      const image = await app.inject({ method: "GET", url: item.display, headers: { cookie } });
      expect(image.statusCode).toBe(200);
      expect(image.headers["cache-control"]).toBe("private, no-store");
    });

    it("publishes a held post the operator approves", async () => {
      const { id } = await heldPost();
      const { cookie } = await admin();
      const res = await decide(cookie, id, { decision: "approve", reason: "テスト_問題なし" });
      expect(res.statusCode).toBe(204);
      expect((await app.inject({ method: "GET", url: `/api/posts/${id}` })).statusCode).toBe(200);
    });

    it("asks for a reason", async () => {
      const { id } = await heldPost();
      const { cookie } = await admin();
      expect((await decide(cookie, id, { decision: "approve", reason: "" })).statusCode).toBe(400);
    });

    it("keeps the queue, the images and the decisions from everyone else", async () => {
      const { id, ownerCookie } = await heldPost();
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/admin/reviews",
            headers: { cookie: ownerCookie },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/admin/posts/${id}/image/display`,
            headers: { cookie: ownerCookie },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await decide(ownerCookie, id, { decision: "approve", reason: "テスト" })).statusCode,
      ).toBe(404);
    });
  });
  // 通報の対応と、非表示を戻す (S7b-1、ADR-0021)
  describe("reports", () => {
    const base = () => new URL(app.env.AUTH_BASE_URL);
    const send = (cookie: string, url: string, payload: object) =>
      app.inject({
        method: "POST",
        url,
        headers: {
          cookie,
          origin: base().origin,
          host: base().host,
          "content-type": "application/json",
        },
        payload,
      });
    /** 公開の投稿と、それへの通報を直接置く */
    async function reported() {
      const owner = lumorphiaUser();
      const reporter = lumorphiaUser();
      const { cookie: ownerCookie } = await loginWithLumorphia(app, mock, owner);
      const { cookie: reporterCookie } = await loginWithLumorphia(app, mock, reporter);
      const ownerRow = await app.db.query.users.findFirst({
        where: eq(schema.users.lumorphiaSub, owner.sub),
      });
      const id = randomUUID();
      await app.db.insert(schema.posts).values({
        id,
        userId: ownerRow!.id,
        status: "published",
        visibility: "public",
        imageKeyBase: newImageKeyBase(id, "public"),
        width: 1600,
        height: 900,
        publishedAt: new Date(),
      });
      await send(reporterCookie, `/api/posts/${id}/reports`, { reason: "depicted" });
      return { id, ownerCookie, reporterCookie };
    }
    const admin = () => loginWithLumorphia(app, mock, lumorphiaUser({ sub: ADMIN_SUB }));
    type Reports = { items: { id: string; postId: string; display: string }[] };

    it("lists open reports with the post's image for the operator", async () => {
      const { id } = await reported();
      const { cookie } = await admin();
      const list = (
        await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie } })
      ).json() as Reports;
      expect(list.items[0]).toMatchObject({
        postId: id,
        display: `/api/admin/posts/${id}/image/display`,
      });
    });

    it("hides a reported post, and then restores it", async () => {
      const { id } = await reported();
      const { cookie } = await admin();
      const list = (
        await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie } })
      ).json() as Reports;
      const hide = await send(cookie, `/api/admin/reports/${list.items[0]!.id}/hide`, {
        reason: "テスト_写り込み",
      });
      expect(hide.statusCode).toBe(204);
      expect((await app.inject({ method: "GET", url: `/api/posts/${id}` })).statusCode).toBe(404);
      const hidden = (
        await app.inject({ method: "GET", url: "/api/admin/hidden", headers: { cookie } })
      ).json() as { items: { id: string }[] };
      expect(hidden.items.map((p) => p.id)).toContain(id);
      const restore = await send(cookie, `/api/admin/posts/${id}/restore`, {
        reason: "テスト_誤り",
      });
      expect(restore.statusCode).toBe(204);
      expect((await app.inject({ method: "GET", url: `/api/posts/${id}` })).statusCode).toBe(200);
    });

    it("dismisses a report and leaves the post", async () => {
      const { id } = await reported();
      const { cookie } = await admin();
      const list = (
        await app.inject({ method: "GET", url: "/api/admin/reports", headers: { cookie } })
      ).json() as Reports;
      const res = await send(cookie, `/api/admin/reports/${list.items[0]!.id}/dismiss`, {
        reason: "テスト_問題なし",
      });
      expect(res.statusCode).toBe(204);
      expect((await app.inject({ method: "GET", url: `/api/posts/${id}` })).statusCode).toBe(200);
    });

    it("keeps reports and the hidden posts from everyone else", async () => {
      const { reporterCookie } = await reported();
      for (const url of ["/api/admin/reports", "/api/admin/hidden"])
        expect(
          (await app.inject({ method: "GET", url, headers: { cookie: reporterCookie } }))
            .statusCode,
        ).toBe(404);
    });
  });
});
