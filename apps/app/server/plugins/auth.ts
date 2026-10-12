import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { DomainError } from "@lumorphia-scenote/core";
import {
  createAuth,
  runAuthRequest,
  type Auth,
  type Session,
  type SessionUser,
} from "../auth/auth.ts";

declare module "fastify" {
  interface FastifyInstance {
    auth: Auth;
    /** 未ログインは 401 */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** req.user を埋めるだけ */
    optionalAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: SessionUser | null;
    session: Session | null;
  }
}

/** Better Auth を /api/auth/* にマウントし、認証の decorator を出す (lumorphia/prismtone と同じ形) */
export const authPlugin = fp(
  async (app) => {
    const auth = createAuth({ db: app.db, env: app.env, jobs: app.jobs });
    app.decorate("auth", auth);
    app.decorateRequest("user", null);
    app.decorateRequest("session", null);

    // Better Auth は Web 標準の Request を受ける。Fastify の JSON パーサを通さず raw body を渡す
    app.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) =>
        done(null, body),
      );
      scope.route({
        method: ["GET", "POST"],
        url: "/api/auth/*",
        config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
        schema: { hide: true },
        handler: async (req, reply) => {
          const url = new URL(req.url, app.env.AUTH_BASE_URL);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v === undefined) continue;
            headers.append(k, Array.isArray(v) ? v.join(", ") : v);
          }
          const body =
            req.method === "GET" || req.method === "HEAD"
              ? undefined
              : (req.body as Buffer | undefined);
          const init: RequestInit = { method: req.method, headers };
          if (body && body.length > 0) init.body = new Uint8Array(body);
          const response = await runAuthRequest(() => auth.handler(new Request(url, init)));
          reply.status(response.status);
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            reply.header(key, value);
          });
          const cookies = response.headers.getSetCookie();
          if (cookies.length > 0) reply.header("set-cookie", cookies);
          return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
        },
      });
    });

    const load = async (req: FastifyRequest) => {
      const headers = new Headers();
      if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
      const result = await auth.api.getSession({ headers });
      req.user = result?.user ?? null;
      req.session = result?.session ?? null;
    };
    app.decorate("optionalAuth", async (req: FastifyRequest) => {
      await load(req);
    });
    app.decorate("requireAuth", async (req: FastifyRequest) => {
      await load(req);
      if (!req.user) throw new DomainError("unauthorized", "login required");
    });
  },
  { name: "auth", dependencies: ["db", "jobs"] },
);
