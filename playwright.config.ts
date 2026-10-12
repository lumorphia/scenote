import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { certificateSpki, ensureE2eTls } from "@lumorphia/e2e/tls";
import { DEFAULT_DATABASE_URL, e2eDatabaseUrl } from "./e2e/database.ts";
import { LUMORPHIA, LUMORPHIA_CLIENT_ID } from "./e2e/lumorphia.ts";

const PORT = Number(process.env.E2E_PORT ?? 3445);
const HOST = "scenote.lumorphia.test";
const TLS = new URL(".data/tls/", import.meta.url).pathname;
/** Lumorphia の発行元のふり (@lumorphia/e2e) の TLS。開発の CA とは別。app は NODE_EXTRA_CA_CERTS で信頼する */
const LUMORPHIA_TLS = ensureE2eTls(new URL(".data/e2e-tls/", import.meta.url).pathname);

/**
 * 手元専用の証明書の公開鍵 (SPKI) のハッシュ。Chromium にこの鍵を信頼させ、証明書のエラーを起こさない。
 * ignoreHTTPSErrors だと、CSS などの読み込みがときどき net::ERR_TOO_MANY_RETRIES で落ちる (lumorphia/accounts で起きた)。
 * 証明書がまだ無いときだけ無視する
 */
const CERT_SPKI = existsSync(`${TLS}cert.pem`) ? certificateSpki(`${TLS}cert.pem`) : null;
/** ブラウザは発行元のふりの認可とログアウトの口へも移るので、その証明書も信頼させる */
const LUMORPHIA_SPKI = certificateSpki(LUMORPHIA_TLS.cert);

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
        `--ignore-certificate-errors-spki-list=${[CERT_SPKI, LUMORPHIA_SPKI].filter(Boolean).join(",")}`,
      ],
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      // Lumorphia アカウントの発行元のふり (@lumorphia/e2e、ADR-0009)。認可画面は spec が route で受ける
      command: "pnpm exec lumorphia-mock-issuer",
      url: `${LUMORPHIA.controlUrl}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        LUMORPHIA_CLIENT_ID,
        LUMORPHIA_SERVICE: "scenote",
        MOCK_LUMORPHIA_CERT: LUMORPHIA_TLS.cert,
        MOCK_LUMORPHIA_KEY: LUMORPHIA_TLS.key,
        MOCK_LUMORPHIA_PORT: new URL(LUMORPHIA.issuer).port,
        MOCK_LUMORPHIA_CONTROL_PORT: new URL(LUMORPHIA.controlUrl).port,
        APP_BASE_URL: `https://127.0.0.1:${PORT}`,
        POST_LOGOUT_REDIRECT_ORIGINS: `https://${HOST}:${PORT}`,
        // back-channel logout をアプリ (開発の CA の証明書で https) に送るので、その CA を信頼する
        NODE_EXTRA_CA_CERTS: `${TLS}ca.pem`,
      },
    },
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
        AUTH_SECRET: "test-e2e-secret-test-e2e-secret-1234",
        AUTH_BASE_URL: `https://${HOST}:${PORT}`,
        LUMORPHIA_ISSUER: LUMORPHIA.issuer,
        LUMORPHIA_CLIENT_ID,
        LUMORPHIA_CLIENT_SECRET: "test-e2e-scenote-secret",
        NODE_EXTRA_CA_CERTS: LUMORPHIA_TLS.ca,
        LOG_LEVEL: "warn",
      },
    },
  ],
});
