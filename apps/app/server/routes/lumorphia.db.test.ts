import { createServer } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { schema } from "@lumorphia-scenote/db";
import { startMockIssuer, type MockIssuer } from "@lumorphia/e2e/mock-issuer";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { buildApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { loginWithLumorphia, mergeCookies } from "../test/lumorphia-login.ts";

const url = process.env.DATABASE_URL;
const CLIENT_ID = "test-scenote";

/** back-channel logout を受けるため、アプリを listen させるポートを先に決める */
const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });

// Lumorphia でログイン・ログアウト (ADR-0009)。発行元は @lumorphia/e2e のふりで、本物と同じ道を通す
describe.skipIf(!url)("Lumorphia login (PostgreSQL)", () => {
  let app: FastifyInstance;
  let mock: MockIssuer;

  beforeAll(async () => {
    const port = await freePort();
    mock = await startMockIssuer({
      clientId: CLIENT_ID,
      service: "scenote",
      tls: {
        cert: process.env.SCENOTE_TEST_LUMORPHIA_CERT!,
        key: process.env.SCENOTE_TEST_LUMORPHIA_KEY!,
      },
      appBaseUrl: `http://127.0.0.1:${port}`,
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
    });
    await app.listen({ port, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await app?.close();
    await mock?.close();
  });

  beforeEach(async () => {
    await app.db.delete(schema.users);
  });

  const me = async (cookie: string) =>
    (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json() as {
      user: { handle: string; name: string; image: string | null } | null;
      loginAvailable: boolean;
    };
  const userOf = async (sub: string) =>
    app.db.query.users.findFirst({ where: eq(schema.users.lumorphiaSub, sub) });

  describe("starting the login", () => {
    const start = (query: string, cookie = "") =>
      app.inject({ method: "GET", url: `/api/lumorphia/login${query}`, headers: { cookie } });

    it("sends the browser to Lumorphia's authorization endpoint", async () => {
      const res = await start("");
      expect(res.statusCode).toBe(302);
      expect(String(res.headers.location).startsWith(`${mock.issuer}/oauth2/authorize?`)).toBe(
        true,
      );
    });

    it("keeps the state of the login in a cookie", async () => {
      const res = await start("");
      expect(String(res.headers["set-cookie"])).toMatch(/scenote\./);
    });

    it("sends a logged-in user straight to where they were going", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const res = await start("?next=/edit", cookie);
      expect(res.headers.location).toBe("/edit");
    });

    it("does not send a logged-in user off the site", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const res = await start("?next=//evil.example/", cookie);
      expect(res.headers.location).toBe("/");
    });
  });

  describe("login", () => {
    it("sends the browser back to the top page after logging in", async () => {
      const result = await loginWithLumorphia(app, mock, lumorphiaUser());
      expect(result.status).toBe(302);
      expect(result.location).toBe("/");
    });

    it("creates a Scenote user with the Lumorphia handle, name and icon", async () => {
      const u = lumorphiaUser({ picture: "https://img.example.invalid/icon.webp" });
      await loginWithLumorphia(app, mock, u);
      expect(await userOf(u.sub)).toMatchObject({
        handle: u.handle,
        name: u.name,
        image: "https://img.example.invalid/icon.webp",
      });
    });

    it("does not keep the real email address", async () => {
      const u = lumorphiaUser();
      await loginWithLumorphia(app, mock, u);
      expect((await userOf(u.sub))?.email).toBe(`${u.sub}@lumorphia.placeholder.invalid`);
    });

    it("shows the logged-in user to /api/me", async () => {
      const u = lumorphiaUser();
      const { cookie } = await loginWithLumorphia(app, mock, u);
      expect((await me(cookie)).user).toMatchObject({ handle: u.handle, name: u.name });
    });

    it("copies a changed name when the user logs in again", async () => {
      const u = lumorphiaUser();
      await loginWithLumorphia(app, mock, u);
      await loginWithLumorphia(app, mock, { ...u, name: "テスト_変えた名前" });
      expect((await userOf(u.sub))?.name).toBe("テスト_変えた名前");
    });

    it("keeps one Scenote user for one Lumorphia account", async () => {
      const u = lumorphiaUser();
      await loginWithLumorphia(app, mock, u);
      await loginWithLumorphia(app, mock, u);
      expect(await app.db.query.users.findMany()).toHaveLength(1);
    });

    it("lets a new user take a handle over from someone's stale copy", async () => {
      const stale = lumorphiaUser({ handle: "test_taken" });
      await loginWithLumorphia(app, mock, stale);
      const newcomer = lumorphiaUser({ handle: "test_taken" });
      await loginWithLumorphia(app, mock, newcomer);
      expect((await userOf(newcomer.sub))?.handle).toBe("test_taken");
      expect((await userOf(stale.sub))?.handle).toMatch(/^u_/);
    });

    it("tells the screen that Lumorphia login is available", async () => {
      expect((await me("")).loginAvailable).toBe(true);
    });
  });

  describe("logout", () => {
    const logout = (cookie: string) =>
      app.inject({
        method: "POST",
        url: "/api/lumorphia/logout",
        headers: {
          cookie,
          origin: app.env.AUTH_BASE_URL,
          host: new URL(app.env.AUTH_BASE_URL).host,
        },
      });

    it("ends the Scenote session", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const res = await logout(cookie);
      expect((await me(mergeCookies(cookie, res.headers["set-cookie"]))).user).toBeNull();
    });

    it("sends the browser to Lumorphia's end-session with this session's ID token", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const session = await app.db.query.sessions.findFirst();
      const { url: next } = (await logout(cookie)).json() as { url: string };
      const endSession = new URL(next);
      expect(endSession.origin + endSession.pathname).toBe(`${mock.issuer}/oauth2/end-session`);
      expect(endSession.searchParams.get("id_token_hint")).toBe(session?.lumorphiaIdToken);
      expect(endSession.searchParams.get("post_logout_redirect_uri")).toBe(
        `${app.env.AUTH_BASE_URL}/api/lumorphia/signed-out`,
      );
    });

    it("brings the browser back to the top page from Lumorphia", async () => {
      const { cookie } = await loginWithLumorphia(app, mock, lumorphiaUser());
      const { url: next } = (await logout(cookie)).json() as { url: string };
      const state = new URL(next).searchParams.get("state")!;
      const res = await app.inject({
        method: "GET",
        url: `/api/lumorphia/signed-out?state=${state}`,
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/");
    });

    it("refuses to log out without a session", async () => {
      expect((await logout("")).statusCode).toBe(401);
    });
  });

  describe("back-channel logout", () => {
    const backchannel = async (sub: string, sid: string) => {
      const res = await fetch(`${mock.controlUrl}/_e2e/backchannel-logout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sub, sid }),
      });
      return ((await res.json()) as { status: number }).status;
    };

    it("ends the session of the Lumorphia session accounts logged out", async () => {
      const u = lumorphiaUser();
      const { cookie } = await loginWithLumorphia(app, mock, u);
      expect(await backchannel(u.sub, u.sid)).toBe(200);
      expect((await me(cookie)).user).toBeNull();
    });

    it("keeps the same person's session on another device", async () => {
      const u = lumorphiaUser();
      const { cookie: here } = await loginWithLumorphia(app, mock, u);
      await loginWithLumorphia(app, mock, { ...u, sid: "test-sid-other-device" });
      await backchannel(u.sub, "test-sid-other-device");
      expect((await me(here)).user).not.toBeNull();
    });
  });
});
