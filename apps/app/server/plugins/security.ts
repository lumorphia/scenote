import { randomBytes } from "node:crypto";
import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import { buildCspDirectives, CSP_NONCE_HEADER, CSP_REPORT_PATH, serializeCsp } from "../csp.ts";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DOCUMENT_DESTINATIONS = new Set(["document", "iframe", "frame"]);

/** COEP を付けるか。現像の文書 (/edit) と、文書以外の全部の応答 */
function needsCrossOriginIsolation(url: string, dest: string | undefined): boolean {
  const isEditDocument = url === "/edit" || url.startsWith("/edit?");
  return isEditDocument || (dest !== undefined && !DOCUMENT_DESTINATIONS.has(dest));
}

/**
 * HTTP ヘッダと CSRF (lumorphia/prismtone の security plugin と同じ考え方)。
 * CSP は development では付けない (Vite の HMR とインラインの preamble に合わせるより、production build を
 * NODE_ENV=test で動かす E2E で強制下の動作を確かめる)。test / production では強制。
 * 本番で最初は CSP_REPORT_ONLY=1 で違反だけ集め、ゼロを確認してから強制に切り替える
 */
export const securityPlugin = fp(
  async (app) => {
    await app.register(helmet, {
      // CSP は下で毎リクエストに nonce 付きで組み立てる
      contentSecurityPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      frameguard: { action: "deny" },
    });

    const cspEnabled = app.env.NODE_ENV !== "development";
    const reportOnly = app.env.CSP_REPORT_ONLY;

    app.addHook("onRequest", async (req, reply) => {
      reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
      // 現像 (/edit) だけ cross-origin isolated にして SharedArrayBuffer を使えるようにする (lumorphia/editor の
      // ADR-0009)。切り抜き (onnxruntime-web) がマルチスレッドで動く。COOP same-origin は helmet が付けている。
      // COEP のある文書から起こす専用 Worker は、そのスクリプトと import 先の応答にも COEP が要る (Chrome)。
      // 文書以外 (Sec-Fetch-Dest が document / frame でない) には全部付ける (Worker 以外には効かない)。
      // URL で絞ると dev の Vite が配る /web/ や /node_modules/ が漏れる (lumorphia/prismtone と同じ)
      if (needsCrossOriginIsolation(req.url, req.headers["sec-fetch-dest"])) {
        reply.header("cross-origin-embedder-policy", "credentialless");
      }
      if (!cspEnabled) return;
      const nonce = randomBytes(16).toString("base64url");
      req.cspNonce = nonce;
      // SSR (web/entry.server.tsx) はリクエストヘッダから読む。外から同名のヘッダが来ても上書きする
      req.headers[CSP_NONCE_HEADER] = nonce;
      const csp = serializeCsp(
        buildCspDirectives({
          nonce,
          imageBaseUrl: app.env.PUBLIC_IMAGE_BASE_URL,
          sentryDsn: app.env.SENTRY_DSN ?? null,
        }),
      );
      reply.header(
        reportOnly ? "content-security-policy-report-only" : "content-security-policy",
        csp,
      );
    });

    // ブラウザからの CSP 違反レポート。ログに残すだけ。Origin は付かないので CSRF の対象外
    app.addContentTypeParser(
      ["application/csp-report", "application/reports+json"],
      { parseAs: "string", bodyLimit: 16 * 1024 },
      (_req, body, done) => done(null, body),
    );
    app.post(
      CSP_REPORT_PATH,
      {
        schema: { hide: true },
        config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      },
      async (req, reply) => {
        const parsed = parseReport(req.body);
        if (parsed) req.log.warn(parsed, "csp violation reported");
        return reply.code(204).send();
      },
    );

    // CSRF: 変更系は同一オリジンからの Origin ヘッダを要求する。
    // 退会の知らせ (accounts のサーバーから Origin なしで来る) を受けるときは、その入口だけ外して署名で守る
    app.addHook("onRequest", async (req, reply) => {
      if (!MUTATING.has(req.method) || !req.url.startsWith("/api/")) return;
      if (req.url === CSP_REPORT_PATH) return;
      const origin = req.headers.origin;
      if (!origin) {
        return reply.code(403).send({ error: { code: "forbidden", message: "missing origin" } });
      }
      const host = req.headers["x-forwarded-host"] ?? req.headers.host;
      const expected = new URL(origin).host;
      if (host !== expected) {
        return reply.code(403).send({ error: { code: "forbidden", message: "origin mismatch" } });
      }
    });
  },
  { name: "security" },
);

/** 違反レポートから、ログに残す価値のある項目だけ取り出す。壊れた本文は null */
function parseReport(body: unknown): Record<string, string> | null {
  if (typeof body !== "string") return null;
  try {
    const json = JSON.parse(body) as unknown;
    const report =
      json && typeof json === "object" && "csp-report" in json
        ? (json as { "csp-report": Record<string, unknown> })["csp-report"]
        : Array.isArray(json) && json[0] && typeof json[0] === "object" && "body" in json[0]
          ? ((json[0] as { body: Record<string, unknown> }).body ?? null)
          : null;
    if (!report || typeof report !== "object") return null;
    const pick = (...keys: string[]) =>
      keys.map((k) => report[k]).find((v) => typeof v === "string");
    const out = {
      documentUri: pick("document-uri", "documentURL"),
      violatedDirective: pick("violated-directive", "effectiveDirective"),
      blockedUri: pick("blocked-uri", "blockedURL"),
      sourceFile: pick("source-file", "sourceFile"),
    };
    return Object.fromEntries(
      Object.entries(out).filter((e): e is [string, string] => typeof e[1] === "string"),
    ) as Record<string, string>;
  } catch {
    return null;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    /** SSR が出すインラインスクリプトに付ける nonce。development では付かない */
    cspNonce?: string;
  }
}
