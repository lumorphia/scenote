import fp from "fastify-plugin";
import { createStorage, type ObjectStorage } from "@lumorphia/storage";
import { storageConfig } from "../storage-config.ts";

declare module "fastify" {
  interface FastifyInstance {
    storage: ObjectStorage;
  }
}

/** 画像の置き場所 (storage-config.ts)。テストはメモリの実装を渡す */
export const storagePlugin = fp<{ storage?: ObjectStorage }>(
  async (app, opts) => {
    app.decorate("storage", opts.storage ?? createStorage(storageConfig()));
  },
  { name: "storage" },
);
