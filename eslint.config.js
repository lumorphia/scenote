import tseslint from "typescript-eslint";

// 依存の向き (AGENTS.md)。lumorphia/prismtone と同じ形

const packagesWithoutFrameworks = {
  files: ["packages/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          { name: "fastify", message: "packages/* はフレームワークに依存しない" },
          { name: "react-router", message: "packages/* はフレームワークに依存しない" },
        ],
        patterns: [
          {
            group: ["@lumorphia-scenote/app*", "@lumorphia-scenote/worker*"],
            message: "packages/* から apps/* を import しない",
          },
        ],
      },
    ],
  },
};

const webOnlyDependsOnApi = {
  files: ["apps/app/web/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@lumorphia-scenote/core", "@lumorphia-scenote/core/*"],
            message: "web は API だけに依存する",
          },
          {
            group: ["@lumorphia-scenote/db", "@lumorphia-scenote/db/*"],
            message: "web から DB に触れない",
          },
          {
            group: ["../server/*", "../../server/*", "../../../server/*"],
            message: "web から server を import しない",
          },
          { group: ["fastify", "fastify/*"], message: "web から fastify を import しない" },
          {
            group: [
              "@lumorphia/ops/logger",
              "@lumorphia/ops/notify",
              "@lumorphia/media",
              "@lumorphia/storage",
            ],
            message: "サーバーの基盤。web は @lumorphia/ops/sentry だけを使う",
          },
          {
            group: ["@lumorphia/moderation", "@lumorphia/moderation/*"],
            message: "判定の決まりと NG 語を利用者のブラウザに配らない (ADR-0007、ADR-0014)",
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.react-router/**",
      "**/drizzle/**",
      // ブラウザ内の認識のモデルと WASM (`pnpm models` が置く。git には入らない)
      "apps/app/models/**",
      // 確かめるための使い捨て。本体の決まりの外
      "spikes/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  packagesWithoutFrameworks,
  webOnlyDependsOnApi,
);
