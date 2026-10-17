import { randomUUID } from "node:crypto";
import type { MockIssuerLocation, MockLumorphiaUser } from "@lumorphia/e2e/playwright";

/**
 * Lumorphia の発行元のふり (@lumorphia/e2e) の場所。prismtone (3404・3405) と同時に動かせるようずらす。
 * playwright.config.ts の webServer と spec が使う
 */
export const LUMORPHIA: MockIssuerLocation = {
  issuer: "https://127.0.0.1:3454/api/auth",
  controlUrl: "http://127.0.0.1:3455",
};
export const LUMORPHIA_CLIENT_ID = "e2e-scenote";

/** E2E の運営者 (管理画面の許可リスト ADMIN_SUBS に入れる Lumorphia の sub。ADR-0019) */
export const E2E_ADMIN_SUB = "0199f1d2-3c4b-7a5e-9f00-00000000e2e0";

/**
 * E2E の運営者。並列のテストが同じ sub でログインするので、handle と名前も固定する
 * (ログインのたびに写しを書き換えるため、毎回違う handle だとほかのテストのヘッダーとずれる)
 */
export const e2eOperator = (): MockLumorphiaUser => ({
  sub: E2E_ADMIN_SUB,
  sid: `e2e-sid-${randomUUID()}`,
  handle: "e2e_operator",
  name: "テスト_運営",
});
