import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EDITOR_OPTIMIZE_EXCLUDE, EDITOR_OPTIMIZE_INCLUDE } from "./vite-deps.ts";

// engine を依存の最適化から外す (Worker の相対 URL のため) と、その中の import は最適化が辿らない。
// engine がブラウザで import する依存は、全部 include に入っていないと dev でだけ壊れる
// (pixi.js が束ねられず、CommonJS の eventemitter3 を読めずに描画が立ち上がらなかった)。
// E2E は本番ビルドで回るので、ここで止める
const ENGINE = "@lumorphia/editor-engine";

function engineBrowserImports(): string[] {
  const dist = path.dirname(fileURLToPath(import.meta.resolve(ENGINE)));
  const files = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter(
    // bin/ は Node で動く CLI (モデルの取得)。ブラウザには来ない
    (f) => f.endsWith(".js") && !f.startsWith("bin"),
  );
  const specifiers = files.flatMap((f) =>
    [
      ...readFileSync(path.join(dist, f), "utf8").matchAll(
        /(?:from|import)\s*\(?\s*"([^".][^"]*)"/g,
      ),
    ].map((m) => m[1] ?? ""),
  );
  return [...new Set(specifiers)].filter((s) => !s.startsWith("@lumorphia/")).sort();
}

describe("vite optimizeDeps for the editor", () => {
  it("keeps the engine itself out so its worker URLs survive", () => {
    expect(EDITOR_OPTIMIZE_EXCLUDE).toEqual([ENGINE]);
  });

  it("bundles every dependency the engine imports in the browser", () => {
    const covered = (dep: string) =>
      EDITOR_OPTIMIZE_INCLUDE.includes(dep) ||
      EDITOR_OPTIMIZE_INCLUDE.includes(`${ENGINE} > ${dep}`);
    expect(engineBrowserImports().filter((dep) => !covered(dep))).toEqual([]);
  });

  it("finds the engine's imports (the scan itself works)", () => {
    expect(engineBrowserImports()).toContain("pixi.js");
  });
});
