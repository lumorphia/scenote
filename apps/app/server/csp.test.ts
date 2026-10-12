import { describe, expect, it } from "vitest";
import { buildCspDirectives, serializeCsp } from "./csp.ts";

const base = { nonce: "n0nce", imageBaseUrl: "https://img.lumorphia.test", sentryDsn: null };

describe("buildCspDirectives", () => {
  it("allows scripts only from itself, the request nonce and WebAssembly", () => {
    expect(buildCspDirectives(base)["script-src"]).toEqual([
      "'self'",
      "'nonce-n0nce'",
      "'wasm-unsafe-eval'",
    ]);
  });

  it("allows WebAssembly for the editor but not eval or inline scripts", () => {
    const script = buildCspDirectives(base)["script-src"]!;
    expect(script).toContain("'wasm-unsafe-eval'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("lets the editor start workers from itself and blob URLs", () => {
    expect(buildCspDirectives(base)["worker-src"]).toEqual(["'self'", "blob:"]);
  });

  it("allows images only from itself, the image host, data and blob URLs", () => {
    expect(buildCspDirectives(base)["img-src"]).toEqual([
      "'self'",
      "https://img.lumorphia.test",
      "data:",
      "blob:",
    ]);
  });

  it("lets the browser send errors to the Sentry host", () => {
    const d = buildCspDirectives({ ...base, sentryDsn: "https://key@o1.ingest.sentry.io/2" });
    expect(d["connect-src"]).toEqual(["'self'", "https://o1.ingest.sentry.io"]);
  });

  it("forbids framing, plugins and foreign base URLs", () => {
    const d = buildCspDirectives(base);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
  });

  it("ignores a relative image base URL", () => {
    expect(buildCspDirectives({ ...base, imageBaseUrl: "/img" })["img-src"]).toEqual([
      "'self'",
      "data:",
      "blob:",
    ]);
  });
});

describe("serializeCsp", () => {
  it("joins the directives with semicolons", () => {
    expect(serializeCsp({ "default-src": ["'self'"], "img-src": ["'self'", "data:"] })).toBe(
      "default-src 'self'; img-src 'self' data:",
    );
  });
});
