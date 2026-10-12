import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { loadEnv } from "./env.ts";

// DB を使わない振る舞い。DB につないだ死活確認は app.db.test.ts
let app: FastifyInstance;
// 認識のモデルの置き場は `pnpm models` (editor-models) が揃えるもので、テストは手元にあるかに依存しない。仮の置き場を作る
let modelsDir: string;

beforeAll(async () => {
  modelsDir = await mkdtemp(path.join(tmpdir(), "scenote-models-"));
  await mkdir(path.join(modelsDir, "face-landmarker-v1", "wasm"), { recursive: true });
  await writeFile(
    path.join(modelsDir, "face-landmarker-v1", "wasm", "vision_wasm_internal.js"),
    "self.ModuleFactory = () => {};\n",
  );
  app = await buildApp({
    env: loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgres://unused/unused" }),
    skipDb: true,
    modelsDir,
  });
});

afterAll(async () => {
  await app.close();
  await rm(modelsDir, { recursive: true, force: true });
});

describe("security headers", () => {
  it("forbids framing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sends a CSP with a fresh nonce outside development", async () => {
    const a = await app.inject({ method: "GET", url: "/api/health" });
    const b = await app.inject({ method: "GET", url: "/api/health" });
    const nonce = (csp: unknown) => /'nonce-([^']+)'/.exec(String(csp))?.[1];
    expect(nonce(a.headers["content-security-policy"])).toBeTruthy();
    expect(nonce(a.headers["content-security-policy"])).not.toBe(
      nonce(b.headers["content-security-policy"]),
    );
  });

  it("turns off camera, microphone and geolocation", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });
});

// 現像 (/edit) だけ cross-origin isolated にする (lumorphia/editor の ADR-0009)
describe("editor isolation", () => {
  it("isolates the /edit document with COEP credentialless", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/edit?draft=x",
      headers: { "sec-fetch-dest": "document" },
    });
    expect(res.headers["cross-origin-embedder-policy"]).toBe("credentialless");
  });

  it("keeps COOP same-origin on the /edit document", async () => {
    const res = await app.inject({ method: "GET", url: "/edit" });
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
  });

  it("adds COEP to every subresource so the editor's workers can start", async () => {
    const subresources: [string, string][] = [
      ["/assets/x.js", "script"],
      ["/node_modules/@lumorphia/editor-engine/dist/inference/face.worker.js", "worker"],
      ["/models/ort-v1/x.wasm", "empty"],
    ];
    for (const [url, dest] of subresources) {
      const res = await app.inject({ method: "GET", url, headers: { "sec-fetch-dest": dest } });
      expect(res.headers["cross-origin-embedder-policy"], url).toBe("credentialless");
    }
  });

  it("does not isolate other documents", async () => {
    for (const url of ["/", "/editor", "/edit/post"]) {
      const res = await app.inject({
        method: "GET",
        url,
        headers: { "sec-fetch-dest": "document" },
      });
      expect(res.headers["cross-origin-embedder-policy"], url).toBeUndefined();
    }
  });

  it("does not isolate a document fetched without Sec-Fetch-Dest", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.headers["cross-origin-embedder-policy"]).toBeUndefined();
  });
});

describe("recognition models", () => {
  it("serves a model file with an immutable cache", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/models/face-landmarker-v1/wasm/vision_wasm_internal.js",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("answers a missing model file with 404", async () => {
    const res = await app.inject({ method: "GET", url: "/models/nope.js" });
    expect(res.statusCode).toBe(404);
  });

  it("does not list the models directory", async () => {
    const res = await app.inject({ method: "GET", url: "/models/" });
    expect(res.statusCode).not.toBe(200);
    expect(res.body).not.toContain("face-landmarker-v1");
  });
});

describe("CSRF", () => {
  it("rejects a mutating API request without an Origin header", async () => {
    const res = await app.inject({ method: "POST", url: "/api/anything" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: "forbidden", message: "missing origin" } });
  });

  it("rejects a mutating API request from another origin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/anything",
      headers: { origin: "https://evil.example", host: "scenote.lumorphia.test" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe("origin mismatch");
  });

  it("lets a same-origin mutating request reach the route", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/anything",
      headers: { origin: "https://scenote.lumorphia.test", host: "scenote.lumorphia.test" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("API routing", () => {
  it("answers an unknown API path with a JSON 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: "not_found", message: "route not found: GET /api/nope" },
    });
  });

  it("accepts a CSP violation report without an Origin header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/csp-report",
      headers: { "content-type": "application/csp-report" },
      payload: JSON.stringify({ "csp-report": { "document-uri": "https://a/b" } }),
    });
    expect(res.statusCode).toBe(204);
  });
});

describe("health without a database", () => {
  it("reports the database as down with 503", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, db: "error" });
  });
});
