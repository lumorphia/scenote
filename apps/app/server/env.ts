import { z } from "zod";

/** env ファイルの `KEY=` は空の文字列で届くので、未設定として扱う (lumorphia/prismtone 1.13.0 の本番で落ちた) */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

// 環境変数。ストレージなどは段階ごとに足す (docs/plan.md)
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3200),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  /** Sentry 監視。DSN は公開値だが、未設定なら SDK を無効にする */
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().default("production"),
  DATABASE_URL: z.string().min(1),
  /** セッションの署名の鍵。production では必須 (開発とテストは loadEnv が仮の値を入れる) */
  AUTH_SECRET: z.string().min(32),
  /** Scenote の公開の URL。Lumorphia の redirect URI は https に限るので、開発も https (ADR-0008) */
  AUTH_BASE_URL: z
    .string()
    .url()
    .startsWith("https://")
    .default("https://scenote.lumorphia.test:8445"),
  /**
   * Lumorphia アカウントの発行元 (ADR-0009)。例: https://accounts.lumorphia.com/api/auth。
   * 3 つが揃ったときだけログインを出す。クライアントは lumorphia/accounts の登録スクリプトで作る
   */
  LUMORPHIA_ISSUER: optional(z.string().url().startsWith("https://")),
  LUMORPHIA_CLIENT_ID: optional(z.string().min(1)),
  LUMORPHIA_CLIENT_SECRET: optional(z.string().min(1)),
  /** 投稿画像の配信元 (R2 のカスタムドメイン)。CSP の img-src に入る。投稿の段で使う */
  PUBLIC_IMAGE_BASE_URL: z.string().url().default("https://img.example.invalid"),
  /** /api 全体の IP ごとの上限 (1 分) */
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  /**
   * Cloudflare などの信頼できるプロキシが接続元 IP を入れるヘッダ名 (例: cf-connecting-ip)。
   * VPS を Cloudflare の IP だけに絞ってから設定する (lumorphia/prismtone#102)
   */
  CLIENT_IP_HEADER: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined)),
  /** E2E 専用: レート制限を全部外す。本番では無視する */
  API_RATE_LIMIT_DISABLED: z
    .enum(["0", "1", "true", "false"])
    .default("0")
    .transform((v) => v === "1" || v === "true"),
  /** CSP を強制せず Report-Only で違反だけ集める (本番の最初の 1 週間用) */
  CSP_REPORT_ONLY: z
    .string()
    .default("0")
    .transform((v) => v === "1" || v === "true"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse({
    ...source,
    AUTH_SECRET:
      source.AUTH_SECRET ??
      (source.NODE_ENV === "production" ? undefined : "development-only-scenote-auth-secret-0123"),
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`invalid environment: ${missing}`);
  }
  return parsed.data;
}

/** Lumorphia でログインする設定。3 つが揃っていなければ null (ログインを出さない) */
export function lumorphiaConfig(
  env: Env,
): { issuer: string; clientId: string; clientSecret: string } | null {
  if (!env.LUMORPHIA_ISSUER || !env.LUMORPHIA_CLIENT_ID || !env.LUMORPHIA_CLIENT_SECRET)
    return null;
  return {
    issuer: env.LUMORPHIA_ISSUER,
    clientId: env.LUMORPHIA_CLIENT_ID,
    clientSecret: env.LUMORPHIA_CLIENT_SECRET,
  };
}
