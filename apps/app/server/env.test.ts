import { describe, expect, it } from "vitest";
import { lumorphiaConfig, loadEnv } from "./env.ts";

const base = { NODE_ENV: "test", DATABASE_URL: "postgres://unused/unused" } as const;
const lumorphia = {
  LUMORPHIA_ISSUER: "https://accounts.lumorphia.test:8443/api/auth",
  LUMORPHIA_CLIENT_ID: "test-scenote",
  LUMORPHIA_CLIENT_SECRET: "test-secret",
};

describe("loadEnv", () => {
  it("serves the app at the https development host by default", () => {
    expect(loadEnv(base).AUTH_BASE_URL).toBe("https://scenote.lumorphia.test:8445");
  });

  it("refuses an http base URL", () => {
    expect(() => loadEnv({ ...base, AUTH_BASE_URL: "http://scenote.lumorphia.test" })).toThrow(
      /AUTH_BASE_URL/,
    );
  });

  it("gives development a session secret of its own", () => {
    expect(loadEnv(base).AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("requires a session secret in production", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(/AUTH_SECRET/);
  });

  it("treats an empty Lumorphia issuer from an env file as unset", () => {
    // env ファイルの KEY= は空の文字列で届く (lumorphia/prismtone 1.13.0 の本番で落ちた)
    expect(loadEnv({ ...base, LUMORPHIA_ISSUER: "" }).LUMORPHIA_ISSUER).toBeUndefined();
  });
});

describe("lumorphiaConfig", () => {
  it("is null until the issuer, the client and the secret are all set", () => {
    expect(lumorphiaConfig(loadEnv({ ...base, ...lumorphia, LUMORPHIA_CLIENT_SECRET: "" }))).toBe(
      null,
    );
  });

  it("gives the issuer, the client and the secret when all are set", () => {
    expect(lumorphiaConfig(loadEnv({ ...base, ...lumorphia }))).toEqual({
      issuer: lumorphia.LUMORPHIA_ISSUER,
      clientId: lumorphia.LUMORPHIA_CLIENT_ID,
      clientSecret: lumorphia.LUMORPHIA_CLIENT_SECRET,
    });
  });
});
