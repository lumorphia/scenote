import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { lumorphiaConfig } from "../env.ts";
import { withErrors } from "../schemas/error.ts";
import { acceptTerms, consentOf } from "@lumorphia-scenote/core/domain/consent";
import { currentConsentVersion, needsConsent } from "../legal.ts";

const meSchema = z.object({
  /** ログインしていなければ null */
  user: z
    .object({
      id: z.string(),
      handle: z.string(),
      name: z.string(),
      image: z.string().nullable(),
      /** 今の版の規約に同意していない (ADR-0023)。画面は /welcome へ送る */
      needsConsent: z.boolean(),
    })
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
          ? {
              id: user.id,
              handle: user.handle!,
              name: user.name,
              image: user.image ?? null,
              needsConsent: needsConsent(await consentOf(app.db, user.id)),
            }
          : null,
        loginAvailable: lumorphiaConfig(app.env) !== null,
      };
    },
  );

  // 規約とプライバシーポリシーへの同意と、15 歳以上であることの確認 (ADR-0023)。再同意も同じ口
  app.post(
    "/me/consent",
    {
      schema: {
        tags: ["auth"],
        summary: "今の版の利用規約とプライバシーポリシーに同意し、15 歳以上であることを確かめる",
        body: z.object({ ageConfirmed: z.literal(true), termsAccepted: z.literal(true) }),
        response: withErrors({ 204: z.null() }),
      },
      // 何度送っても同じ記録になるだけなので、/api 全体の制限だけにする
      preValidation: [app.requireAuth],
    },
    async (req, reply) => {
      await acceptTerms(app.db, req.user!.id, currentConsentVersion());
      return reply.code(204).send(null);
    },
  );
};
