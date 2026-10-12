/**
 * 現像 (@lumorphia/editor-*) のための Vite の依存の最適化 (vite.config.ts)。lumorphia/editor の ADR-0009、lumorphia/prismtone から写した。
 *
 * - engine は外す: Worker を new Worker(new URL("./x.worker.js", import.meta.url)) で起こすので、
 *   .vite/deps に束ねられると相対 URL が壊れる
 * - 外したパッケージの中の import は最適化が辿らないので、engine がブラウザで使う依存は「engine > 依存」で束ねる。
 *   束ねないと pixi.js がそのまま配られ、CommonJS の eventemitter3 を ESM として読めず、dev で描画が立ち上がらない
 *   (workspace にあったときは node_modules の外なので辿られていた)。足りないものは vite-deps.test.ts が見つける
 * - MediaPipe と transformers.js は押したときに動的 import する。dev の最適化が初めて見つけるとページを丸ごと
 *   リロードし、開いていた画像が消えるので、最初から束ねる
 */
const ENGINE = "@lumorphia/editor-engine";

export const EDITOR_OPTIMIZE_INCLUDE: readonly string[] = [
  "@mediapipe/tasks-vision",
  "@huggingface/transformers",
  `${ENGINE} > pixi.js`,
  `${ENGINE} > pixi.js/unsafe-eval`,
  `${ENGINE} > idb-keyval`,
];

export const EDITOR_OPTIMIZE_EXCLUDE: readonly string[] = [ENGINE];
