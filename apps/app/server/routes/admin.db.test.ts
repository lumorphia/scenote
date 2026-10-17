import { randomUUID } from "node:crypto";
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
const ADMIN_SUB = randomUUID();

// 管理画面の入口 (S7a、ADR-0019)。許可リストにいない人には、管理画面が無いのと同じに答える
describe.skipIf(!url)("the admin API (PostgreSQL)", () => {
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
        ADMIN_SUBS: ADMIN_SUB,
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
});
