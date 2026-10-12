import { fastifyReactRouterDev } from "@mcansh/react-router-fastify/vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { EDITOR_OPTIMIZE_EXCLUDE, EDITOR_OPTIMIZE_INCLUDE } from "./vite-deps.ts";

export default defineConfig(({ mode }) => {
  // dev サーバー (react-router dev) は Fastify を同じプロセスで動かすが、Vite はルートの .env を
  // process.env に流さない。start と同じく ../../.env を読み、すでに設定済みの環境変数を優先する
  const fileEnv = loadEnv(mode, new URL("../..", import.meta.url).pathname, "");
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return {
    // 開発サーバーは http。https は前に置いた Caddy が受ける (compose.yaml、docker/Caddyfile.dev)。
    // Vite 8 は https にすると必ず HTTP/2 になり、その疑似ヘッダー (:method) を @mcansh/react-router-fastify が
    // 扱えないため。DEV_TLS_* は Vite には渡さない
    server: {
      port: Number(process.env.PORT ?? 3200),
      strictPort: true,
      host: "127.0.0.1",
      // Caddy が付ける Host (scenote.lumorphia.test) を許す。ほかのホスト名は Vite が止める
      allowedHosts: [".lumorphia.test"],
      // /edit は COEP credentialless の文書 (server/plugins/security.ts)。そこから起こす Worker のスクリプトと
      // import 先にも COEP が要るが、dev では Vite が /web/ と /node_modules/ を Fastify より先に配るので、
      // こちらにも付ける (Worker 以外には効かない。lumorphia/prismtone と同じ)
      headers: { "Cross-Origin-Embedder-Policy": "credentialless" },
    },
    // 現像の依存の最適化 (vite-deps.ts。engine は外し、engine が使う依存は束ねる)
    optimizeDeps: {
      include: [...EDITOR_OPTIMIZE_INCLUDE],
      exclude: [...EDITOR_OPTIMIZE_EXCLUDE],
    },
    resolve: { dedupe: ["react", "react-dom", "zod"] },
    plugins: [tailwindcss(), reactRouter(), fastifyReactRouterDev({ entry: "./server/index.ts" })],
  };
});
