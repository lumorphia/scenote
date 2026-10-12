import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { eq } from "drizzle-orm";
import {
  createAccountEventHandler,
  createAccountEventVerifier,
  createBackchannelLogoutHandler,
  createLogoutTokenVerifier,
  createLogoutUrl,
} from "@lumorphia/auth-client";
import { schema } from "@lumorphia-scenote/db";
import {
  applyLumorphiaLogout,
  consumeLumorphiaLogoutState,
  createLumorphiaLogoutState,
} from "@lumorphia-scenote/core/domain/lumorphia-logout";
import { applyLumorphiaAccountEvent } from "@lumorphia-scenote/core/domain/lumorphia-account-events";
import { lumorphiaConfig } from "../env.ts";
import { LUMORPHIA_SIGNED_OUT_PATH } from "../lumorphia-paths.ts";
import { withErrors } from "../schemas/error.ts";

/** 戻り先はこのサイトの中のパスだけ。ほかのサイトへ送り出さない */
export function safeNext(input: string | undefined): string {
  if (!input || !input.startsWith("/") || input.startsWith("//") || input.startsWith("/\\"))
    return "/";
  return input;
}

/** Lumorphia のログインの開始とログアウト (ADR-0009。lumorphia/prismtone の ADR-0055・0062 と同じ) */
export const lumorphiaRoutes: FastifyPluginAsyncZod = async (app) => {
  const config = lumorphiaConfig(app.env);
  const lumorphia = config ? { issuer: config.issuer, clientId: config.clientId } : null;

  app.get(
    "/lumorphia/login",
    {
      schema: { hide: true, querystring: z.object({ next: z.string().max(2000).optional() }) },
      preValidation: [app.optionalAuth],
    },
    async (req, reply) => {
      reply.header("cache-control", "no-store");
      const next = safeNext(req.query.next);
      if (req.user) return reply.redirect(next, 302);
      // 開発で accounts を立てていないとき
      if (!lumorphia) return reply.redirect("/login?error=login_unavailable", 302);
      // 画面を一瞬も見せずに accounts の認可へ送る (lumorphia/prismtone の ADR-0062)
      const headers = new Headers();
      if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
      const started = await app.auth.api.signInSocial({
        body: {
          provider: "lumorphia",
          callbackURL: next,
          errorCallbackURL: `/login?next=${encodeURIComponent(next)}`,
        },
        headers,
        asResponse: true,
      });
      const cookies = started.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      const { url } = (await started.json()) as { url?: string };
      if (!started.ok || !url) return reply.redirect("/login?error=login_unavailable", 302);
      return reply.redirect(url, 302);
    },
  );

  app.post(
    "/lumorphia/logout",
    {
      schema: {
        tags: ["auth"],
        summary: "ログアウトする。accounts のログアウトへ移る URL を返す",
        response: withErrors({ 200: z.object({ url: z.string().nullable() }) }),
      },
      preValidation: [app.requireAuth],
    },
    async (req, reply) => {
      const session = await app.db.query.sessions.findFirst({
        columns: { lumorphiaIdToken: true },
        where: eq(schema.sessions.id, req.session!.id),
      });
      const headers = new Headers();
      if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
      const signedOut = await app.auth.api.signOut({ headers, asResponse: true });
      const cookies = signedOut.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      if (!lumorphia || !session?.lumorphiaIdToken) return { url: null };
      return {
        url: createLogoutUrl({
          ...lumorphia,
          postLogoutRedirectUri: new URL(LUMORPHIA_SIGNED_OUT_PATH, app.env.AUTH_BASE_URL).href,
          state: await createLumorphiaLogoutState(app.db),
          idTokenHint: session.lumorphiaIdToken,
        }),
      };
    },
  );

  app.get(
    "/lumorphia/signed-out",
    { schema: { hide: true, querystring: z.object({ state: z.string().max(200).optional() }) } },
    async (req, reply) => {
      // 知らない state でもログアウトは済んでいるので、トップへ戻すだけ
      if (req.query.state) await consumeLumorphiaLogoutState(app.db, req.query.state);
      return reply.redirect("/", 302);
    },
  );

  if (!lumorphia) return;
  const handleLogout = createBackchannelLogoutHandler({
    verifyLogoutToken: createLogoutTokenVerifier(lumorphia),
    adapter: { logoutOnce: async (event) => void (await applyLumorphiaLogout(app.db, event)) },
  });
  const handleAccountEvent = createAccountEventHandler({
    verify: createAccountEventVerifier({ ...lumorphia, service: "scenote" }),
    adapter: {
      // 退会・復旧・物理削除の知らせを当てる (ADR-0010)。失敗は 500 で、accounts が送り直す
      applyOnce: (event) =>
        applyLumorphiaAccountEvent(
          { db: app.db, jobs: app.jobs },
          {
            eventId: event.eventId,
            sub: event.sub,
            revision: event.revision,
            state: event.state,
            deletedAt: event.deletedAt ? new Date(event.deletedAt) : null,
          },
        ),
    },
  });
  /** auth-client の受け口に Request を渡し、Response をそのまま返す */
  const forward = (handler: (request: Request) => Promise<Response>) =>
    async function (req: FastifyRequest, reply: FastifyReply) {
      const response = await handler(
        new Request(new URL(req.url, app.env.AUTH_BASE_URL), {
          method: "POST",
          headers: { "content-type": req.headers["content-type"] ?? "" },
          body: typeof req.body === "string" ? req.body : "",
        }),
      );
      if (response.status >= 500) req.log.error({ url: req.url }, "lumorphia notice failed");
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.code(response.status).send(await response.text());
    };
  app.register(async (scope) => {
    // auth-client が本文の大きさと形を確かめるので、ここでは文字列のまま渡す
    scope.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string", bodyLimit: 32 * 1024 },
      (_req, body, done) => done(null, body),
    );
    scope.post(
      "/lumorphia/backchannel-logout",
      { schema: { hide: true }, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
      forward(handleLogout),
    );
    scope.post(
      "/lumorphia/account-events",
      { schema: { hide: true }, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
      forward(handleAccountEvent),
    );
  });
};
