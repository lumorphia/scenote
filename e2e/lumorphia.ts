import type { MockIssuerLocation } from "@lumorphia/e2e/playwright";

/**
 * Lumorphia の発行元のふり (@lumorphia/e2e) の場所。prismtone (3404・3405) と同時に動かせるようずらす。
 * playwright.config.ts の webServer と spec が使う
 */
export const LUMORPHIA: MockIssuerLocation = {
  issuer: "https://127.0.0.1:3454/api/auth",
  controlUrl: "http://127.0.0.1:3455",
};
export const LUMORPHIA_CLIENT_ID = "e2e-scenote";
