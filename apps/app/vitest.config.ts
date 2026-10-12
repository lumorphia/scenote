import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "app",
    include: ["*.test.ts", "server/**/*.test.ts", "web/**/*.test.ts"],
    setupFiles: ["../../packages/db/src/vitest-setup.ts"],
    // Lumorphia の発行元のふり (https) の CA を信頼させる (server/test/lumorphia-tls-setup.ts)
    globalSetup: ["server/test/lumorphia-tls-setup.ts"],
  },
});
