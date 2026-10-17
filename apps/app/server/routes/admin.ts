import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { withErrors } from "../schemas/error.ts";

/**
 * 管理画面の API (S7a、ADR-0019)。どれも requireAdmin を通す。
 * 外側は Cloudflare Access が /admin と /api/admin を守る (本番の runbook)
 */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  // 画面が、管理画面を出してよいかを確かめる
  app.get(
    "/admin/me",
    {
      schema: {
        tags: ["admin"],
        summary: "管理画面に入れるか",
        response: withErrors({ 200: z.object({ ok: z.literal(true) }) }),
      },
      preValidation: [app.requireAdmin],
    },
    async () => ({ ok: true as const }),
  );
};
