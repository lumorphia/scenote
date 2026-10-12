import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { lumorphiaConfig } from "../env.ts";
import { withErrors } from "../schemas/error.ts";

const meSchema = z.object({
  /** ログインしていなければ null */
  user: z
    .object({ id: z.string(), handle: z.string(), name: z.string(), image: z.string().nullable() })
    .nullable(),
  /** Lumorphia でログインできるか (LUMORPHIA_* が揃っている) */
  loginAvailable: z.boolean(),
});

/** 本人の情報。画面のヘッダーとログインの loader が読む */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/me",
    {
      schema: {
        tags: ["auth"],
        summary: "本人の情報",
        response: withErrors({ 200: meSchema }),
      },
      preValidation: [app.optionalAuth],
    },
    async (req, reply) => {
      reply.header("cache-control", "no-store");
      const user = req.user;
      return {
        user: user
          ? { id: user.id, handle: user.handle!, name: user.name, image: user.image ?? null }
          : null,
        loginAvailable: lumorphiaConfig(app.env) !== null,
      };
    },
  );
};
