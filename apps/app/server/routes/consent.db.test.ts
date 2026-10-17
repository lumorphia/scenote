import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { MemoryStorage } from "@lumorphia/storage";
import { schema } from "@lumorphia-scenote/db";
import { startMockIssuer, type MockIssuer } from "@lumorphia/e2e/mock-issuer";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { buildApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { readLegalVersions } from "../legal.ts";
import { loginWithLumorphia } from "../test/lumorphia-login.ts";

const url = process.env.DATABASE_URL;
const CLIENT_ID = "test-scenote";

// 規約とプライバシーポリシーへの同意 (S7d、ADR-0023)
describe.skipIf(!url)("consent to the terms (PostgreSQL)", () => {
  let app: FastifyInstance;
  let mock: MockIssuer;

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
      }),
      storage: new MemoryStorage({ publicBaseUrl: "/_storage" }),
    });
  });
  afterAll(async () => {
    await app?.close();
    await mock?.close();
  });
  beforeEach(async () => {
    await app.db.delete(schema.users);
  });

  const base = () => new URL(app.env.AUTH_BASE_URL);
  const send = (cookie: string, method: "POST" | "DELETE", path: string, payload?: object) =>
    app.inject({
      method,
      url: path,
      headers: {
        cookie,
        origin: base().origin,
        host: base().host,
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      ...(payload ? { payload } : {}),
    });
  const me = (cookie: string) =>
    app
      .inject({ method: "GET", url: "/api/me", headers: { cookie } })
      .then((r) => r.json() as { user: { needsConsent: boolean } | null });
  const askUpload = (cookie: string) =>
    send(cookie, "POST", "/api/uploads", { mime: "image/webp", bytes: 10 });

  it("asks someone who has just logged in to agree", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser(), { consent: false });
    expect((await me(cookie)).user?.needsConsent).toBe(true);
  });

  it("refuses to take a photo before they agree", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser(), { consent: false });
    const res = await askUpload(cookie);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: { code: "forbidden", message: "terms consent required" },
    });
  });

  it("needs both the age and the agreement", async () => {
    const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser(), { consent: false });
    expect(
      (await send(cookie, "POST", "/api/me/consent", { ageConfirmed: false, termsAccepted: true }))
        .statusCode,
    ).toBe(400);
  });

  it("records the versions agreed to, and then lets them post", async () => {
    const user = lumorphiaUser();
    const { cookie } = await loginWithLumorphia(app, mock, user, { consent: false });
    const res = await send(cookie, "POST", "/api/me/consent", {
      ageConfirmed: true,
      termsAccepted: true,
    });
    expect(res.statusCode).toBe(204);
    expect((await me(cookie)).user?.needsConsent).toBe(false);
    const row = await app.db.query.users.findFirst({
      where: eq(schema.users.lumorphiaSub, user.sub),
    });
    const current = readLegalVersions();
    expect(row?.termsAcceptedVersion).toBe(`terms=${current.terms};privacy=${current.privacy}`);
    expect(row?.termsAcceptedAt).toBeInstanceOf(Date);
    expect((await askUpload(cookie)).statusCode).toBe(201);
  });

  it("asks again when the terms change in a way that needs it", async () => {
    const user = lumorphiaUser();
    const { cookie } = await loginWithLumorphia(app, mock, user);
    await app.db
      .update(schema.users)
      .set({ termsAcceptedVersion: "terms=0.9;privacy=0.9" })
      .where(eq(schema.users.lumorphiaSub, user.sub));
    expect((await me(cookie)).user?.needsConsent).toBe(true);
    expect((await askUpload(cookie)).statusCode).toBe(403);
  });

  it("lets someone who has not agreed still delete their own post", async () => {
    const user = lumorphiaUser();
    const { cookie } = await loginWithLumorphia(app, mock, user);
    const owner = await app.db.query.users.findFirst({
      where: eq(schema.users.lumorphiaSub, user.sub),
    });
    const [post] = await app.db
      .insert(schema.posts)
      .values({ userId: owner!.id, imageKeyBase: "posts/test/test-key" })
      .returning();
    await app.db
      .update(schema.users)
      .set({ termsAcceptedVersion: null })
      .where(eq(schema.users.id, owner!.id));
    expect((await send(cookie, "DELETE", `/api/posts/${post!.id}`)).statusCode).toBe(204);
  });

  it("does not ask a visitor", async () => {
    expect((await me("")).user).toBeNull();
  });
});
