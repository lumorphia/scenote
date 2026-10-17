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

describe("loadEnv for posting", () => {
  it("serves development images from the app itself", () => {
    expect(loadEnv(base).PUBLIC_IMAGE_BASE_URL).toBe("/_storage");
  });

  it("requires the image host in production", () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        AUTH_SECRET: "test-production-secret-0123456789",
      }),
    ).toThrow(/PUBLIC_IMAGE_BASE_URL/);
  });

  it("runs jobs inside the app during development", () => {
    expect(loadEnv(base).JOBS_INLINE).toBe(true);
  });

  it("can hand jobs to the worker during development", () => {
    expect(loadEnv({ ...base, JOBS_INLINE: "0" }).JOBS_INLINE).toBe(false);
  });

  it("never runs jobs inside the app in production", () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: "production",
      AUTH_SECRET: "test-production-secret-0123456789",
      PUBLIC_IMAGE_BASE_URL: "https://img.example.invalid",
      JOBS_INLINE: "1",
    });
    expect(env.JOBS_INLINE).toBe(false);
  });

  it("accepts images up to the editor's limit by default", () => {
    expect(loadEnv(base).UPLOAD_MAX_BYTES).toBe(30 * 1024 * 1024);
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

// 管理画面の許可リスト (S7a、ADR-0019)。lumorphia/accounts の ADR-0015 と同じ形
describe("loadEnv for the admin", () => {
  const sub = "0199f1d2-3c4b-7a5e-9f00-123456789abc";
  const other = "0199f1d2-3c4b-7a5e-9f00-cba987654321";

  it("lets nobody in when the list is missing", () => {
    expect(loadEnv(base).ADMIN_SUBS).toEqual([]);
  });

  it("lets nobody in when the list is empty in an env file", () => {
    expect(loadEnv({ ...base, ADMIN_SUBS: "" }).ADMIN_SUBS).toEqual([]);
  });

  it("reads the Lumorphia subs separated by commas", () => {
    expect(loadEnv({ ...base, ADMIN_SUBS: ` ${sub}, ${other} ` }).ADMIN_SUBS).toEqual([sub, other]);
  });

  it("refuses to start with a value that is not a sub", () => {
    expect(() => loadEnv({ ...base, ADMIN_SUBS: `${sub},test-admin` })).toThrow(/ADMIN_SUBS/);
  });
});
