import path from "node:path";
import fastifyStatic from "@fastify/static";
import fp from "fastify-plugin";

/**
 * ブラウザ内の認識のモデルと WASM を /models/ で配る (lumorphia/editor の ADR-0009)。`pnpm models`
 * (@lumorphia/editor-engine の editor-models) が apps/app/models/<name>-v<n>/ に揃えたもの (git には入れない)。
 * Vite の public/ に置かない理由: dev の Vite が import() に ?import を足し、MediaPipe が WASM ローダーを読めない。
 * Fastify で配れば dev も本番も同じ経路で素のファイルが返る。ディレクトリに版が付いているので immutable でよい。
 * COEP は security.ts が文書以外に付ける (lumorphia/prismtone と同じ)
 */
export const MODELS_DIR = path.resolve(import.meta.dirname, "../../models");

export const modelsPlugin = fp<{ root?: string }>(
  async (app, opts) => {
    await app.register(fastifyStatic, {
      root: opts.root ?? MODELS_DIR,
      prefix: "/models/",
      decorateReply: false,
      cacheControl: true,
      maxAge: "1y",
      immutable: true,
      // 一覧は出さない。無いファイルは 404 (react-router の catch-all に落とさない)
      index: false,
      list: false,
    });
  },
  { name: "models" },
);
