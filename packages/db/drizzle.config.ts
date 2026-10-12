import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  // pg-boss は自身のスキーマ (pgboss) を持つ。drizzle-kit の管理対象から外す (lumorphia/prismtone の ADR-0007)
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://scenote:scenote@localhost:5435/scenote",
  },
  strict: true,
  verbose: true,
});
