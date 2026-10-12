import { createHash, X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { DEFAULT_DATABASE_URL, e2eDatabaseUrl } from "./e2e/database.ts";

const PORT = Number(process.env.E2E_PORT ?? 3445);
const HOST = "scenote.lumorphia.test";
const TLS = new URL(".data/tls/", import.meta.url).pathname;

/**
 * 手元専用の証明書の公開鍵 (SPKI) の SHA-256。Chromium にこの鍵を信頼させ、証明書のエラーを起こさない。
 * ignoreHTTPSErrors だと、新しい接続のたびに「証明書のエラー → 無視して再開」を通り、CSS などの読み込みが
 * ときどき net::ERR_TOO_MANY_RETRIES で失敗する (lumorphia/accounts で起きた)。証明書がまだ無いときだけ無視する
 */
const CERT_SPKI = existsSync(`${TLS}cert.pem`)
  ? createHash("sha256")
      .update(
        new X509Certificate(readFileSync(`${TLS}cert.pem`)).publicKey.export({
          type: "spki",
          format: "der",
        }),
      )
      .digest("base64")
  : null;

/**
 * E2E は https で回す (ADR-0008)。証明書は scripts/dev-certs.sh が作る手元専用の CA のもの。
 * *.lumorphia.test は Chromium の起動オプションで 127.0.0.1 に向ける (/etc/hosts を触らない)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `https://${HOST}:${PORT}`,
    locale: "ja-JP",
    trace: "retain-on-failure",
    // 手元専用の CA はブラウザが知らないので、証明書の公開鍵を信頼させる (CERT_SPKI)
    ignoreHTTPSErrors: CERT_SPKI === null,
    launchOptions: {
      args: [
        `--host-resolver-rules=MAP *.lumorphia.test 127.0.0.1`,
        ...(CERT_SPKI ? [`--ignore-certificate-errors-spki-list=${CERT_SPKI}`] : []),
      ],
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      // DB の用意 → ビルド → 本番と同じ起動 (NODE_ENV=test)
      command:
        "node e2e/prepare-db.ts && pnpm --filter @lumorphia-scenote/app build && pnpm --filter @lumorphia-scenote/app exec node server/index.ts",
      url: `https://127.0.0.1:${PORT}/api/health`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        PORT: String(PORT),
        HOST: "127.0.0.1",
        DATABASE_URL: e2eDatabaseUrl(),
        E2E_BASE_DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
        DEV_TLS_CERT: `${TLS}cert.pem`,
        DEV_TLS_KEY: `${TLS}key.pem`,
        API_RATE_LIMIT_DISABLED: "1",
        LOG_LEVEL: "warn",
      },
    },
  ],
});
